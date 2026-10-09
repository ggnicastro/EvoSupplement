#!/usr/bin/perl
# EvoSupplement portable server. Only Perl core modules; no CPAN packages.
use strict;
use warnings;
use IO::Socket::INET;
use Cwd qw(abs_path);
use POSIX qw(WNOHANG SIG_BLOCK SIG_UNBLOCK SIGCHLD sigprocmask);
use Fcntl qw(O_RDONLY O_NOFOLLOW);

my $root=abs_path(shift @ARGV // '.');
die "Extract the complete ZIP before opening the supplement.\n" unless defined($root) && -f "$root/index.html";
my $server=IO::Socket::INET->new(LocalAddr=>'127.0.0.1',LocalPort=>0,Proto=>'tcp',Listen=>32,ReuseAddr=>0)
  or die "Cannot start local supplement: $!\n";
my $host='127.0.0.1:'.$server->sockport;
my $origin='http://'.$host;
my %children;
$|=1;
print "\nEvoSupplement - portable\n\nOpen: $origin/\n\nKeep this window open while viewing.\nClose it or press Ctrl+C to stop.\n\n";
$SIG{PIPE}='IGNORE';
$SIG{CHLD}=sub { while((my $pid=waitpid(-1,WNOHANG))>0){delete $children{$pid};} };
for my $sig (qw(INT TERM HUP)) {
  $SIG{$sig}=sub { close $server; kill 'TERM',keys %children if %children; print "Supplement stopped.\n"; exit 0; };
}
if (!$ENV{EVOSUPPLEMENT_NO_BROWSER}) {
  my $pid=fork();
  if(defined($pid) && !$pid) { close $server; exec('/usr/bin/open',$origin.'/'); exit 1; }
}
my %mimes=(
  html=>'text/html; charset=utf-8',htm=>'text/html; charset=utf-8',js=>'text/javascript; charset=utf-8',mjs=>'text/javascript; charset=utf-8',
  css=>'text/css; charset=utf-8',json=>'application/json; charset=utf-8',svg=>'image/svg+xml',png=>'image/png',jpg=>'image/jpeg',jpeg=>'image/jpeg',
  gif=>'image/gif',webp=>'image/webp',ico=>'image/x-icon',woff=>'font/woff',woff2=>'font/woff2',ttf=>'font/ttf',otf=>'font/otf',wasm=>'application/wasm',
  pdf=>'application/pdf',mp4=>'video/mp4',webm=>'video/webm',txt=>'text/plain; charset=utf-8',csv=>'text/csv; charset=utf-8',
  tsv=>'text/tab-separated-values; charset=utf-8',yaml=>'text/plain; charset=utf-8',yml=>'text/plain; charset=utf-8',pdb=>'text/plain; charset=utf-8',
  cif=>'text/plain; charset=utf-8',molx=>'application/zip',zip=>'application/zip'
);
sub send_all {
  my ($socket,$bytes)=@_;my $offset=0;
  while($offset<length($bytes)) { my $n=syswrite($socket,$bytes,length($bytes)-$offset,$offset);return 0 unless $n;$offset+=$n; }
  return 1;
}
sub respond {
  my ($socket,$code,$label,$head)=@_; my $body="$code $label\n";
  send_all($socket,"HTTP/1.1 $code $label\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ".length($body)."\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nCross-Origin-Resource-Policy: same-origin\r\n\r\n".($head?'':$body));
}
sub serve {
  my ($socket)=@_;my $buffer='';
  local $SIG{ALRM}=sub {die "request timeout\n";}; alarm 15;
  while(index($buffer,"\r\n\r\n")<0 && length($buffer)<16384) {
    my $n=sysread($socket,my $chunk,4096);return unless $n; $buffer.=$chunk;
  }
  if(index($buffer,"\r\n\r\n")<0 || index($buffer,"\r\n\r\n")>16384) { respond($socket,431,'Headers Too Large',0);return; }
  my ($header)=split(/\r\n\r\n/,$buffer,2);my @lines=split(/\r\n/,$header);
  my ($method,$raw)=shift(@lines)=~/\A(GET|HEAD) ([^\s]+) HTTP\/1\.[01]\z/;
  if(!defined $method){respond($socket,405,'Method Not Allowed',0);return;}
  my $head=$method eq 'HEAD';my %headers;
  for my $line (@lines) {
    my ($key,$val)=$line=~/\A([\w-]+):[ \t]*(.*)\z/;
    if(!defined($key) || exists($headers{lc $key})) {respond($socket,400,'Bad Request',$head);return;}
    $val=~s/[ \t]+\z//;$headers{lc $key}=$val;
  }
  if(($headers{host}//'') ne $host || (exists($headers{origin}) && $headers{origin} ne $origin) || ($headers{'sec-fetch-site'}//'') eq 'cross-site') {
    respond($socket,403,'Forbidden',$head);return;
  }
  $raw=~s/\?.*\z//;
  if($raw!~m{\A/} || $raw=~/%(?![0-9a-fA-F]{2})/) {respond($socket,400,'Bad Request',$head);return;}
  my $path=$raw;$path=~s/%([0-9a-fA-F]{2})/chr(hex($1))/ge;
  if($path=~/[\x00-\x1f\x7f\\:]/) {respond($socket,400,'Bad Request',$head);return;}
  my $file=$root;
  for my $part (split('/',$path)) {
    next if $part eq '';
    if($part=~/\A\./ || lc($part) eq '_portable' || $part=~/\AOpen-supplement/i) {respond($socket,404,'Not Found',$head);return;}
    $file.='/'.$part;
    if(-l $file) {respond($socket,404,'Not Found',$head);return;}
  }
  if(-d $file) {
    if($raw!~m{/\z}) {send_all($socket,"HTTP/1.1 301 Moved Permanently\r\nLocation: $origin$raw/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");return;}
    $file.='/index.html';
  }
  my $real=abs_path($file);
  if(!defined($real) || index($real,$root.'/')!=0 || -l $file || !-f $file) {respond($socket,404,'Not Found',$head);return;}
  sysopen(my $fh,$file,O_RDONLY|O_NOFOLLOW) or do {respond($socket,404,'Not Found',$head);return;};
  binmode $fh; my $size=(stat($fh))[7];my ($start,$end,$partial)=(0,$size-1,0);
  if(defined($headers{range}) && $headers{range}=~/\Abytes=(\d*)-(\d*)\z/) {
    my ($a,$b)=($1,$2);my $valid=$size>0 && (length($a) || length($b)) && length($a)<=18 && length($b)<=18;
    if(length($a)) {$start=0+$a;$end=length($b)?0+$b:$size-1;$valid=0 if $start>=$size || $end<$start;$end=$size-1 if $end>=$size;}
    else {$valid=0 if !$b;$start=$b>$size?0:$size-$b;}
    if(!$valid){send_all($socket,"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$size\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");close $fh;return;}
    $partial=1;
  }
  my ($ext)=$file=~/\.([^.\/]+)\z/;my $type=$mimes{lc($ext//'')}//'application/octet-stream';
  my $count=$end-$start+1;my $status=$partial?'206 Partial Content':'200 OK';my $rh=$partial?"Content-Range: bytes $start-$end/$size\r\n":'';
  send_all($socket,"HTTP/1.1 $status\r\nContent-Type: $type\r\nContent-Length: $count\r\n${rh}Accept-Ranges: bytes\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nCross-Origin-Resource-Policy: same-origin\r\n\r\n");
  if(!$head) {
    sysseek($fh,$start,0);alarm 120;
    while($count>0) {my $n=sysread($fh,my $chunk,$count>65536?65536:$count);last unless $n;last unless send_all($socket,$chunk);$count-=$n;}
  }
  close $fh;alarm 0;
}
while(1) {
  my $client=$server->accept();next unless $client;
  if(keys(%children)>=32) {close $client;next;}
  my $blocked=POSIX::SigSet->new(SIGCHLD);sigprocmask(SIG_BLOCK,$blocked);
  my $pid=fork();
  if(!defined $pid) {sigprocmask(SIG_UNBLOCK,$blocked);close $client;next;}
  if(!$pid) {
    close $server;for my $sig(qw(INT TERM HUP CHLD)) {$SIG{$sig}='DEFAULT';}
    sigprocmask(SIG_UNBLOCK,$blocked);
    eval {serve($client);};close $client;exit 0;
  }
  $children{$pid}=1;sigprocmask(SIG_UNBLOCK,$blocked);close $client;
}
