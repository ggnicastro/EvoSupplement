/* EvoSupplement portable HTTP server. Linux x86-64 with system glibc.
 * Build: cc -O2 -pthread -o evosupplement launcher.c
 * Only serves regular files below the publication root, over IPv4 loopback.
 */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <netinet/in.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

static int rootfd = -1, listener = -1;
static char expected_host[64], expected_origin[96];
static volatile sig_atomic_t stopping;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned int active;

static void stop_server(int sig) {
    (void)sig; stopping = 1;
    if (listener >= 0) { close(listener); listener = -1; }
}

static int send_all(int fd, const void *data, size_t size) {
    const char *p = data;
    while (size) {
        ssize_t n = send(fd, p, size, MSG_NOSIGNAL);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return 0;
        p += n; size -= (size_t)n;
    }
    return 1;
}

static void error_response(int fd, int code, const char *label, int head) {
    char body[128], header[512];
    int bn = snprintf(body, sizeof body, "%d %s\n", code, label);
    int hn = snprintf(header, sizeof header,
        "HTTP/1.1 %d %s\r\nContent-Type: text/plain; charset=utf-8\r\n"
        "Content-Length: %d\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n"
        "Cross-Origin-Resource-Policy: same-origin\r\n\r\n", code, label, bn);
    if (send_all(fd, header, (size_t)hn) && !head) send_all(fd, body, (size_t)bn);
}

static int hex_value(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static int decode_path(char *p) {
    char *r = p, *w = p;
    while (*r) {
        unsigned char c = (unsigned char)*r++;
        if (c == '%') {
            if (!r[0] || !r[1]) return 0;
            int a = hex_value(r[0]), b = hex_value(r[1]);
            if (a < 0 || b < 0) return 0;
            c = (unsigned char)(a * 16 + b); r += 2;
        }
        if (c < 32 || c == 127 || c == '\\' || c == ':') return 0;
        *w++ = (char)c;
    }
    *w = 0; return 1;
}

/* Walk using directory handles and O_NOFOLLOW: no symlinks or path escapes. */
static int open_file(char *path, struct stat *st, int *directory) {
    int current = dup(rootfd);
    if (current < 0) return -1;
    char *state = NULL, *part = strtok_r(path, "/", &state);
    while (part) {
        if (part[0] == '.' || !strcmp(part, "_portable") ||
            !strncasecmp(part, "Open-supplement", 15)) { close(current); return -1; }
        char *next = strtok_r(NULL, "/", &state);
        int child = openat(current, part, O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
        close(current); current = child;
        if (current < 0) return -1;
        if (fstat(current, st) < 0 || (next && !S_ISDIR(st->st_mode))) {
            close(current); return -1;
        }
        part = next;
    }
    if (fstat(current, st) < 0) { close(current); return -1; }
    if (S_ISDIR(st->st_mode)) {
        *directory=1;
        int child = openat(current, "index.html", O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
        close(current); current = child;
        if (current < 0 || fstat(current, st) < 0) { if (current >= 0) close(current); return -1; }
    }
    if (!S_ISREG(st->st_mode)) { close(current); return -1; }
    return current;
}

static const char *mime(const char *path, int directory) {
    if (directory) return "text/html; charset=utf-8";
    const char *ext = strrchr(path, '.');
    if (!ext) return "application/octet-stream";
    const char *pairs[][2] = {
        {".html", "text/html; charset=utf-8"}, {".htm", "text/html; charset=utf-8"},
        {".js", "text/javascript; charset=utf-8"}, {".mjs", "text/javascript; charset=utf-8"},
        {".css", "text/css; charset=utf-8"}, {".json", "application/json; charset=utf-8"},
        {".svg", "image/svg+xml"}, {".png", "image/png"}, {".jpg", "image/jpeg"},
        {".jpeg", "image/jpeg"}, {".gif", "image/gif"}, {".webp", "image/webp"},
        {".ico", "image/x-icon"}, {".woff", "font/woff"}, {".woff2", "font/woff2"},
        {".ttf", "font/ttf"}, {".otf", "font/otf"}, {".wasm", "application/wasm"},
        {".pdf", "application/pdf"}, {".mp4", "video/mp4"}, {".webm", "video/webm"},
        {".txt", "text/plain; charset=utf-8"}, {".tsv", "text/tab-separated-values; charset=utf-8"},
        {".csv", "text/csv; charset=utf-8"}, {".yaml", "text/plain; charset=utf-8"},
        {".yml", "text/plain; charset=utf-8"}, {".pdb", "text/plain; charset=utf-8"},
        {".cif", "text/plain; charset=utf-8"}, {".zip", "application/zip"}, {".molx", "application/zip"}
    };
    for (size_t i = 0; i < sizeof pairs / sizeof pairs[0]; ++i)
        if (!strcasecmp(ext, pairs[i][0])) return pairs[i][1];
    return "application/octet-stream";
}

static int decimal(const char *p, unsigned long long *v) {
    if (!*p) return 0;
    *v=0;
    for (const char *q=p; *q; ++q) {
        if (*q < '0' || *q > '9') return 0;
        unsigned int digit=(unsigned int)(*q-'0');
        if(*v>(ULLONG_MAX-digit)/10) return 0;
        *v=*v*10+digit;
    }
    return 1;
}

static int parse_range(char *range, off_t size, off_t *start, off_t *end) {
    if (strncmp(range,"bytes=",6) || strchr(range,',')) return 0;
    char *value=range+6, *dash=strchr(value,'-');
    if (!dash || size<=0) return -1;
    *dash++=0; unsigned long long first=0,last=0;
    if (!*value) {
        if (!decimal(dash,&last) || !last) return -1;
        *start=last>=(unsigned long long)size?0:size-(off_t)last; *end=size-1;
    } else {
        if (!decimal(value,&first) || first>=(unsigned long long)size) return -1;
        *start=(off_t)first; *end=size-1;
        if (*dash) {
            if (!decimal(dash,&last) || last<first) return -1;
            if (last<(unsigned long long)*end) *end=(off_t)last;
        }
    }
    return 1;
}

static void serve(int fd) {
    char buf[16385]; size_t used=0;
    while (used<sizeof buf-1) {
        ssize_t n=recv(fd,buf+used,sizeof buf-1-used,0);
        if (n<=0) return;
        used+=(size_t)n; buf[used]=0;
        if (strstr(buf,"\r\n\r\n")) break;
    }
    char *header_end=strstr(buf,"\r\n\r\n");
    if (!header_end) { error_response(fd,431,"Headers Too Large",0); return; }
    *header_end=0;
    char *line_end=strstr(buf,"\r\n");
    if (!line_end) { error_response(fd,400,"Bad Request",0); return; }
    *line_end=0;
    char path[8193],*method=buf,*target=strchr(buf,' '),*version=NULL;
    if(target) {*target++=0;version=strchr(target,' ');}
    if(version) *version++=0;
    if (!target || !version || !*target || strlen(target)>=sizeof path ||
        (strcmp(version,"HTTP/1.1") && strcmp(version,"HTTP/1.0"))) {
        error_response(fd,400,"Bad Request",0); return;
    }
    strcpy(path,target);
    int head=!strcmp(method,"HEAD");
    if (strcmp(method,"GET") && !head) { error_response(fd,405,"Method Not Allowed",0); return; }
    char *host=NULL,*origin=NULL,*site=NULL,*range=NULL,*line=line_end+2;
    int hosts=0;
    while (*line) {
        char *end=strstr(line,"\r\n"); if (end) *end=0;
        char *colon=strchr(line,':');
        if (!colon) { error_response(fd,400,"Bad Request",head); return; }
        *colon++=0; while (*colon==' ' || *colon=='\t') ++colon;
        char *tail=colon+strlen(colon); while(tail>colon && (tail[-1]==' ' || tail[-1]=='\t')) *--tail=0;
        if (!strcasecmp(line,"Host")) {host=colon; ++hosts;}
        if (!strcasecmp(line,"Origin")) origin=colon;
        if (!strcasecmp(line,"Sec-Fetch-Site")) site=colon;
        if (!strcasecmp(line,"Range")) range=colon;
        if (!end) break;
        line=end+2;
    }
    if (hosts!=1 || strcmp(host,expected_host) ||
        (origin && strcmp(origin,expected_origin)) || (site && !strcmp(site,"cross-site"))) {
        error_response(fd,403,"Forbidden",head); return;
    }
    if (path[0]!='/') { error_response(fd,400,"Bad Request",head); return; }
    char *query=strchr(path,'?'); if (query) *query=0;
    char raw_path[sizeof path]; strcpy(raw_path,path);
    if (!decode_path(path)) { error_response(fd,400,"Bad Request",head); return; }
    char original[sizeof path]; strcpy(original,path);
    int directory=!strcmp(path,"/") || path[strlen(path)-1]=='/';
    struct stat st; int file=open_file(path,&st,&directory);
    if (file<0) { error_response(fd,404,"Not Found",head); return; }
    if(directory && raw_path[strlen(raw_path)-1]!='/') {
        char redirect[8704];
        int size=snprintf(redirect,sizeof redirect,"HTTP/1.1 301 Moved Permanently\r\nLocation: %s%s/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",expected_origin,raw_path);
        send_all(fd,redirect,(size_t)size);close(file);return;
    }
    off_t start=0,end=st.st_size-1; int partial=range?parse_range(range,st.st_size,&start,&end):0;
    if (partial<0) {
        char header[256]; int n=snprintf(header,sizeof header,"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */%lld\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",(long long)st.st_size);
        send_all(fd,header,(size_t)n); close(file); return;
    }
    char header[1024],range_header[160]="";
    if (partial) snprintf(range_header,sizeof range_header,"Content-Range: bytes %lld-%lld/%lld\r\n",(long long)start,(long long)end,(long long)st.st_size);
    off_t remaining=end-start+1;
    int n=snprintf(header,sizeof header,
        "HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %lld\r\n%s"
        "Accept-Ranges: bytes\r\nConnection: close\r\nCache-Control: no-cache\r\n"
        "X-Content-Type-Options: nosniff\r\nCross-Origin-Resource-Policy: same-origin\r\n\r\n",
        partial?"206 Partial Content":"200 OK",mime(original,directory),(long long)remaining,range_header);
    if (send_all(fd,header,(size_t)n) && !head && lseek(file,start,SEEK_SET)>=0) {
        char chunk[65536];
        while (remaining>0) {
            size_t want=remaining<(off_t)sizeof chunk?(size_t)remaining:sizeof chunk;
            ssize_t got=read(file,chunk,want);
            if (got<=0 || !send_all(fd,chunk,(size_t)got)) break;
            remaining-=got;
        }
    }
    close(file);
}

static void *worker(void *ptr) {
    int fd=(int)(intptr_t)ptr;
    struct timeval timeout={15,0};
    setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof timeout);
    setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof timeout);
    serve(fd); close(fd);
    pthread_mutex_lock(&lock); --active; pthread_mutex_unlock(&lock);
    return NULL;
}

int main(int argc,char **argv) {
    char root[PATH_MAX],executable[PATH_MAX]; int no_browser=getenv("EVOSUPPLEMENT_NO_BROWSER")!=NULL,console=0;
    ssize_t len=readlink("/proc/self/exe",root,sizeof root-1);
    if (len<0) {
        if(!realpath(argv[0],root)) { perror("Cannot locate supplement"); return 1; }
    } else root[len]=0;
    strcpy(executable,root); char *slash=strrchr(root,'/'); if(slash) *slash=0;
    for(int i=1;i<argc;++i) {
        if(!strcmp(argv[i],"--no-browser")) no_browser=1;
        else if(!strcmp(argv[i],"--console")) console=1;
        else if(!strcmp(argv[i],"--root") && i+1<argc) {
            if(!realpath(argv[++i],root)) {perror("Publication folder"); return 1;}
        } else { fprintf(stderr,"Usage: %s [--no-browser] [--root FOLDER]\n",argv[0]); return 1; }
    }
    if(!no_browser && !console && !isatty(STDIN_FILENO)) {
        /* Fixed argument arrays, never a shell command containing user paths. */
        execlp("x-terminal-emulator","x-terminal-emulator","-e",executable,"--console","--root",root,(char*)NULL);
        execlp("gnome-terminal","gnome-terminal","--wait","--",executable,"--console","--root",root,(char*)NULL);
        execlp("konsole","konsole","--separate","-e",executable,"--console","--root",root,(char*)NULL);
        execlp("xfce4-terminal","xfce4-terminal","--disable-server","-x",executable,"--console","--root",root,(char*)NULL);
        execlp("xterm","xterm","-e",executable,"--console","--root",root,(char*)NULL);
        fprintf(stderr,"No desktop terminal found. Open a terminal in the extracted folder and run ./Open-supplement\n");
        return 1;
    }
    rootfd=open(root,O_RDONLY|O_DIRECTORY|O_CLOEXEC);
    if(rootfd<0 || faccessat(rootfd,"index.html",R_OK,0)<0) {
        fprintf(stderr,"index.html not found. Extract the complete ZIP before opening the supplement.\n");return 1;
    }
    listener=socket(AF_INET,SOCK_STREAM|SOCK_CLOEXEC,0);
    struct sockaddr_in address={0}; address.sin_family=AF_INET; address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(listener<0 || bind(listener,(struct sockaddr*)&address,sizeof address)<0 || listen(listener,64)<0) {
        perror("Cannot start local supplement");return 1;
    }
    socklen_t alen=sizeof address; getsockname(listener,(struct sockaddr*)&address,&alen);
    snprintf(expected_host,sizeof expected_host,"127.0.0.1:%u",ntohs(address.sin_port));
    snprintf(expected_origin,sizeof expected_origin,"http://%s",expected_host);
    printf("\nEvoSupplement - portable\n\nOpen: %s/\n\nKeep this window open while viewing.\nClose it or press Ctrl+C to stop.\n\n",expected_origin); fflush(stdout);
    if(!no_browser) {
        pid_t browser=fork();
        if(browser==0) {
            close(listener);close(rootfd);
            execlp("xdg-open","xdg-open",expected_origin,(char*)NULL);
            fprintf(stderr,"Open the address above in your browser.\n");_exit(1);
        }
        signal(SIGCHLD,SIG_IGN);
    }
    struct sigaction sa={0}; sa.sa_handler=stop_server; sigemptyset(&sa.sa_mask);
    sigaction(SIGINT,&sa,NULL);sigaction(SIGTERM,&sa,NULL);sigaction(SIGHUP,&sa,NULL);
    signal(SIGPIPE,SIG_IGN);
    while(!stopping) {
        int fd=accept4(listener,NULL,NULL,SOCK_CLOEXEC);
        if(fd<0) {if(stopping)break; if(errno==EINTR)continue; perror("Accept");break;}
        pthread_mutex_lock(&lock);
        if(active>=32) {pthread_mutex_unlock(&lock);close(fd);continue;}
        ++active;pthread_mutex_unlock(&lock);
        pthread_t thread;
        if(pthread_create(&thread,NULL,worker,(void*)(intptr_t)fd)) {
            close(fd);pthread_mutex_lock(&lock);--active;pthread_mutex_unlock(&lock);
        } else pthread_detach(thread);
    }
    close(rootfd); puts("Supplement stopped."); return 0;
}
