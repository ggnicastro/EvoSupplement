using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

// Compiled locally by Windows PowerShell 5 / .NET Framework. No installed runtime,
// elevated privileges, execution-policy changes, or external network is required.
public static class EvoSupplementPortable
{
    private const int HeaderLimit = 16384;
    private const int MaxClients = 24;

    private sealed class Server
    {
        public string Root;
        public string Prefix;
        public string Host;
        public string Origin;
        public TcpListener Listener;
        public volatile bool Stopping;
        public readonly Semaphore Slots = new Semaphore(MaxClients, MaxClients);
    }

    public static void Run(string directory)
    {
        string root = Path.GetFullPath(directory);
        if (root.Length > Path.GetPathRoot(root).Length)
            root = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!Directory.Exists(root) || IsReparse(root) || !File.Exists(Path.Combine(root, "index.html")))
            throw new IOException("Extraia o ZIP completo antes de abrir o suplemento. index.html deve estar ao lado do iniciador.");

        Server server = new Server();
        server.Root = root;
        server.Prefix = root.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal)
            ? root : root + Path.DirectorySeparatorChar;
        server.Listener = new TcpListener(IPAddress.Loopback, 0);
        server.Listener.Start(32);
        int port = ((IPEndPoint)server.Listener.LocalEndpoint).Port;
        server.Host = "127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture);
        server.Origin = "http://" + server.Host;

        ConsoleCancelEventHandler cancel = delegate(object sender, ConsoleCancelEventArgs e)
        {
            e.Cancel = true;
            server.Stopping = true;
            server.Listener.Stop();
        };
        Console.CancelKeyPress += cancel;
        try
        {
            Console.WriteLine("EvoSupplement aberto somente neste computador.");
            Console.WriteLine("Endereco: " + server.Origin + "/");
            Console.WriteLine("Mantenha esta janela aberta. Feche-a ou pressione Ctrl+C para encerrar.");
            try
            {
                Process.Start(new ProcessStartInfo(server.Origin + "/") { UseShellExecute = true });
            }
            catch (Exception)
            {
                Console.WriteLine("Abra o endereco acima no seu navegador.");
            }

            while (!server.Stopping)
            {
                TcpClient client;
                try { client = server.Listener.AcceptTcpClient(); }
                catch (SocketException) { if (server.Stopping) break; throw; }
                catch (ObjectDisposedException) { if (server.Stopping) break; throw; }
                if (!server.Slots.WaitOne(0)) { client.Close(); continue; }
                ThreadPool.QueueUserWorkItem(delegate(object value)
                {
                    TcpClient connection = (TcpClient)value;
                    try { Serve(server, connection); }
                    catch (IOException) { }
                    catch (SocketException) { }
                    catch (ObjectDisposedException) { }
                    catch (UnauthorizedAccessException) { }
                    finally { connection.Close(); server.Slots.Release(); }
                }, client);
            }
        }
        finally
        {
            server.Stopping = true;
            server.Listener.Stop();
            Console.CancelKeyPress -= cancel;
        }
    }

    private static void Serve(Server server, TcpClient client)
    {
        client.NoDelay = true;
        client.ReceiveTimeout = 10000;
        client.SendTimeout = 30000;
        NetworkStream stream = client.GetStream();
        stream.ReadTimeout = 10000;
        stream.WriteTimeout = 30000;
        string request = ReadHeaders(stream);
        if (request == null) { Error(stream, 400, "Bad Request", false, null); return; }
        string[] lines = request.Split(new string[] { "\r\n" }, StringSplitOptions.None);
        string[] first = lines[0].Split(' ');
        if (first.Length != 3 || (first[2] != "HTTP/1.1" && first[2] != "HTTP/1.0"))
        { Error(stream, 400, "Bad Request", false, null); return; }
        bool head = first[0] == "HEAD";
        if (first[0] != "GET" && !head)
        { Error(stream, 405, "Method Not Allowed", false, "Allow: GET, HEAD\r\n"); return; }
        for (int i = 0; i < first[1].Length; i++)
            if (first[1][i] <= 32 || first[1][i] == 127)
            { Error(stream, 400, "Bad Request", head, null); return; }

        Dictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (lines.Length > 100) { Error(stream, 431, "Request Header Fields Too Large", head, null); return; }
        for (int i = 1; i < lines.Length; i++)
        {
            if (lines[i].Length == 0) continue;
            int colon = lines[i].IndexOf(':');
            if (colon <= 0 || Char.IsWhiteSpace(lines[i][0]))
            { Error(stream, 400, "Bad Request", head, null); return; }
            string name = lines[i].Substring(0, colon);
            for (int j = 0; j < name.Length; j++)
                if (!IsHeaderToken(name[j])) { Error(stream, 400, "Bad Request", head, null); return; }
            if (headers.ContainsKey(name)) { Error(stream, 400, "Bad Request", head, null); return; }
            headers.Add(name, lines[i].Substring(colon + 1).Trim());
        }
        string host, origin, site;
        if (!headers.TryGetValue("Host", out host) || !String.Equals(host, server.Host, StringComparison.Ordinal))
        { Error(stream, 403, "Forbidden", head, null); return; }
        if (headers.TryGetValue("Origin", out origin) && !String.Equals(origin, server.Origin, StringComparison.Ordinal))
        { Error(stream, 403, "Forbidden", head, null); return; }
        if (headers.TryGetValue("Sec-Fetch-Site", out site) && site != "same-origin" && site != "none")
        { Error(stream, 403, "Forbidden", head, null); return; }
        if (headers.ContainsKey("Transfer-Encoding") ||
            (headers.ContainsKey("Content-Length") && headers["Content-Length"] != "0"))
        { Error(stream, 400, "Bad Request", head, null); return; }

        bool directory;
        string path = SafePath(server, first[1], out directory);
        if (path == null) { Error(stream, 404, "Not Found", head, null); return; }
        int queryAt = first[1].IndexOf('?');
        string requestPath = queryAt < 0 ? first[1] : first[1].Substring(0, queryAt);
        if (directory && !requestPath.EndsWith("/", StringComparison.Ordinal))
        {
            string location = requestPath + "/" + (queryAt < 0 ? "" : first[1].Substring(queryAt));
            WriteHeaders(stream, 301, "Moved Permanently", "text/plain; charset=utf-8", 0, "Location: " + location + "\r\n");
            return;
        }
        FileStream file;
        try { file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.SequentialScan); }
        catch (IOException) { Error(stream, 404, "Not Found", head, null); return; }
        catch (UnauthorizedAccessException) { Error(stream, 404, "Not Found", head, null); return; }
        using (file)
        {
            long length = file.Length;
            long start = 0;
            long end = length - 1;
            string range;
            bool partial = headers.TryGetValue("Range", out range);
            if (partial && !ParseRange(range, length, out start, out end))
            {
                Error(stream, 416, "Range Not Satisfiable", head,
                    "Content-Range: bytes */" + length.ToString(CultureInfo.InvariantCulture) + "\r\n");
                return;
            }
            long count = length == 0 ? 0 : end - start + 1;
            string extra = "Accept-Ranges: bytes\r\n";
            if (partial)
                extra += "Content-Range: bytes " + start.ToString(CultureInfo.InvariantCulture) + "-" +
                    end.ToString(CultureInfo.InvariantCulture) + "/" + length.ToString(CultureInfo.InvariantCulture) + "\r\n";
            WriteHeaders(stream, partial ? 206 : 200, partial ? "Partial Content" : "OK", Mime(path), count, extra);
            if (head || count == 0) return;
            file.Seek(start, SeekOrigin.Begin);
            byte[] buffer = new byte[65536];
            while (count > 0 && !server.Stopping)
            {
                int read = file.Read(buffer, 0, (int)Math.Min(count, buffer.Length));
                if (read == 0) break;
                stream.Write(buffer, 0, read);
                count -= read;
            }
        }
    }

    private static string ReadHeaders(NetworkStream stream)
    {
        byte[] buffer = new byte[HeaderLimit];
        Stopwatch clock = Stopwatch.StartNew();
        for (int i = 0; i < buffer.Length; i++)
        {
            if (clock.ElapsedMilliseconds > 10000) return null;
            int value = stream.ReadByte();
            if (value < 0 || value > 126 || (value < 32 && value != 9 && value != 10 && value != 13)) return null;
            buffer[i] = (byte)value;
            if (i >= 3 && buffer[i - 3] == 13 && buffer[i - 2] == 10 && buffer[i - 1] == 13 && buffer[i] == 10)
                return Encoding.ASCII.GetString(buffer, 0, i + 1);
        }
        return null;
    }

    private static bool IsHeaderToken(char c)
    {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
            "!#$%&'*+-.^_`|~".IndexOf(c) >= 0;
    }

    private static string SafePath(Server server, string target, out bool directory)
    {
        directory = false;
        if (!target.StartsWith("/", StringComparison.Ordinal) || target.StartsWith("//", StringComparison.Ordinal) || target.IndexOf('#') >= 0)
            return null;
        int query = target.IndexOf('?');
        if (query >= 0) target = target.Substring(0, query);
        for (int i = 0; i < target.Length; i++)
            if (target[i] == '%')
            {
                if (i + 2 >= target.Length || !Uri.IsHexDigit(target[i + 1]) || !Uri.IsHexDigit(target[i + 2])) return null;
                i += 2;
            }
        string decoded;
        try { decoded = Uri.UnescapeDataString(target); }
        catch (UriFormatException) { return null; }
        if (decoded.IndexOf('\\') >= 0 || decoded.IndexOf(':') >= 0) return null;
        for (int i = 0; i < decoded.Length; i++) if (Char.IsControl(decoded[i])) return null;
        string[] parts = decoded.Split('/');
        string path = server.Root;
        try
        {
            foreach (string part in parts)
            {
                if (part.Length == 0) continue;
                // Reject '~' to prevent NTFS short-name aliases from bypassing control-file checks.
                if (part.StartsWith(".", StringComparison.Ordinal) || part.EndsWith(".", StringComparison.Ordinal) || part.IndexOf('~') >= 0 ||
                    part.EndsWith(" ", StringComparison.Ordinal) || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
                    String.Equals(part, "_portable", StringComparison.OrdinalIgnoreCase) || IsControlFile(part) || IsDeviceName(part)) return null;
                path = Path.Combine(path, part);
                if (IsReparse(path)) return null;
            }
            path = Path.GetFullPath(path);
            if (!String.Equals(path, server.Root, StringComparison.OrdinalIgnoreCase) &&
                !path.StartsWith(server.Prefix, StringComparison.OrdinalIgnoreCase)) return null;
            if (Directory.Exists(path))
            {
                directory = true;
                path = Path.Combine(path, "index.html");
                if (IsReparse(path)) return null;
            }
            return File.Exists(path) ? path : null;
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
        catch (ArgumentException) { return null; }
        catch (NotSupportedException) { return null; }
    }

    private static bool IsReparse(string path)
    {
        try { return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0; }
        catch (FileNotFoundException) { return false; }
        catch (DirectoryNotFoundException) { return false; }
    }

    private static bool IsControlFile(string name)
    {
        // Scientific supplementary scripts are ordinary downloads, never executed.
        return name.StartsWith("Abrir-suplemento", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsDeviceName(string name)
    {
        string stem = name.Split('.')[0].ToUpperInvariant();
        if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" || stem == "CLOCK$") return true;
        return stem.Length == 4 && (stem.StartsWith("COM", StringComparison.Ordinal) || stem.StartsWith("LPT", StringComparison.Ordinal)) &&
            (stem[3] >= '1' && stem[3] <= '9');
    }

    private static bool ParseRange(string value, long length, out long start, out long end)
    {
        start = 0; end = length - 1;
        if (length == 0 || !value.StartsWith("bytes=", StringComparison.Ordinal) || value.IndexOf(',') >= 0) return false;
        string[] parts = value.Substring(6).Split('-');
        if (parts.Length != 2) return false;
        if (parts[0].Length == 0)
        {
            long suffix;
            if (!Int64.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out suffix) || suffix <= 0) return false;
            start = Math.Max(0, length - suffix);
            return true;
        }
        if (!Int64.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out start) || start >= length) return false;
        if (parts[1].Length > 0)
        {
            if (!Int64.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out end) || end < start) return false;
            end = Math.Min(end, length - 1);
        }
        return true;
    }

    private static void Error(NetworkStream stream, int code, string reason, bool head, string extra)
    {
        byte[] body = Encoding.UTF8.GetBytes(code.ToString(CultureInfo.InvariantCulture) + " " + reason + "\n");
        WriteHeaders(stream, code, reason, "text/plain; charset=utf-8", body.Length, extra);
        if (!head) stream.Write(body, 0, body.Length);
    }

    private static void WriteHeaders(NetworkStream stream, int code, string reason, string type, long length, string extra)
    {
        string header = "HTTP/1.1 " + code.ToString(CultureInfo.InvariantCulture) + " " + reason + "\r\n" +
            "Content-Type: " + type + "\r\nContent-Length: " + length.ToString(CultureInfo.InvariantCulture) + "\r\n" +
            "Connection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n" +
            "Cross-Origin-Resource-Policy: same-origin\r\nContent-Security-Policy: frame-ancestors 'self'\r\n" +
            "Referrer-Policy: no-referrer\r\n" + (extra ?? "") + "\r\n";
        byte[] bytes = Encoding.ASCII.GetBytes(header);
        stream.Write(bytes, 0, bytes.Length);
    }

    private static string Mime(string path)
    {
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".html": case ".htm": return "text/html; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": case ".map": return "application/json; charset=utf-8";
            case ".wasm": return "application/wasm";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".avif": return "image/avif";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".otf": return "font/otf";
            case ".pdf": return "application/pdf";
            case ".csv": return "text/csv; charset=utf-8";
            case ".tsv": return "text/tab-separated-values; charset=utf-8";
            case ".txt": case ".md": case ".yaml": case ".yml": case ".pdb": case ".cif":
            case ".mmcif": case ".fa": case ".fasta": case ".faa": case ".aln": case ".tree":
            case ".nwk": case ".newick": case ".info": return "text/plain; charset=utf-8";
            case ".mp4": return "video/mp4";
            case ".webm": return "video/webm";
            case ".mp3": return "audio/mpeg";
            case ".wav": return "audio/wav";
            case ".zip": return "application/zip";
            case ".molx": return "application/zip";
            case ".gz": return "application/gzip";
            default: return "application/octet-stream";
        }
    }
}
