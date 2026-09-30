---
title: "Keygenme — MD5 Hex Spliced Into a License Key"
slug: keygenme
type: re
diff: hard
platform: picoctf
read_time: 18
summary: "The binary assembles the full 36-character key on the stack out of two MD5 digests — so the lazy solve is to break in and read it out."
tags: md5, keygen, reverse-engineering, gdb, stack, picoctf
---
<h2>Keygenme — MD5 Hex Spliced Into a License Key</h2>
<p>"Can you get the flag?" — picoCTF 2022 is done teasing: most RE challenges ask you to <em>break</em> a check, this one asks you to <em>produce</em> the key that passes it. The catch is the binary already knows the full 36-character key: it assembles it on the stack out of a hardcoded prefix, two MD5 digests and a closing brace, right before comparing it against your input. So the laziest solve isn't writing a keygen at all — it's breaking inside the checker and string-searching the fully-built key from memory.</p>

<h3>1 · First Run — It Wants a License Key</h3>
<pre><code><span class="tok-func">gdb</span> keygenme
gef➤ r
Starting program .../keygenme
Enter your license key: <span class="tok-string">AAAAAAAAAA</span>
That key is invalid.</code></pre>
<p>No flag anywhere in sight. The binary is stripped, so there is no <code>main</code> symbol for GDB to <code>break *main</code> on — but the very first challenge is relocating the interesting code.</p>

<h3>2 · Finding main in a Stripped Binary</h3>
<p>Trick: break on <code>printf</code> — every program prints something before doing work — and let the call stack walk back to the caller:</p>
<pre><code>gef➤ b *printf
Breakpoint 1 at 0x10b0
gef➤ r
...
#0  __printf (format=<span class="tok-string">"Enter your license key: "</span>) at printf.c:28
#1  0x5555555554be → mov rdx, [rip+0x2b4b]  # &lt;stdin&gt;
#2  0x7ffff7b16d0a → __libc_start_main(main=<span class="tok-num">0x55555555548b</span>, ...)</code></pre>
<p><span class="tok-comment">__libc_start_main exposes main = 0x55555555548b</span>. Finish the <code>printf</code>, single-step twice, and the very next branch of code is the license-checker call:</p>
<pre><code>gef➤ finish
gef➤ si
gef➤ si
→ 0x5555555554c9  mov esi, <span class="tok-num">0x25</span>        <span class="tok-comment"># fgets(buf, 0x25, stdin)</span>
   0x5555555554ce  mov rdi, rax
   0x5555555554d1  call fgets@plt
   0x5555555554dd  call <span class="tok-num">0x555555555209</span>   <span class="tok-comment"># ← sub_1209(&amp;buf) — the real work</span>
   0x5555555554e2  test al, al</code></pre>
<p>So <code>main</code> slurps up to <code>0x25</code> (37) bytes with <code>fgets</code> and funnels the buffer into the stripped function at <code>0x555555555209</code>. That function is the whole game.</p>

<h3>3 · Decompile the Checker</h3>
<p>Binary Ninja recovers the function formerly known as <code>sub_1209</code>:</p>
<pre><code><span class="tok-num">00001209</span> int64_t sub_1209(char* arg1)

<span class="tok-num">00001242</span> var_98 = <span class="tok-num">0x7b4654436f636970</span>     <span class="tok-comment"># "picoCTF{"</span>
<span class="tok-num">00001249</span> var_90 = <span class="tok-num">0x30795f676e317262</span>     <span class="tok-comment"># "br1ng_y0"</span>
<span class="tok-num">0000125a</span> var_88 = <span class="tok-num">0x6b5f6e77305f7275</span>     <span class="tok-comment"># "ur_0wn_k"</span>
<span class="tok-num">0000125e</span> var_80 = <span class="tok-num">0x5f7933</span>               <span class="tok-comment"># "3y_"</span>
<span class="tok-num">00001265</span> var_ba = <span class="tok-num">0x7d</span>                  <span class="tok-comment"># "}"</span>

<span class="tok-num">00001278</span> MD5(&amp;var_98, strlen(&amp;var_98), &amp;var_b8, ...)   <span class="tok-comment"># MD5("picoCTF{br1ng_y0ur_0wn_k3y_")</span>
<span class="tok-num">000012bf</span> MD5(&amp;var_ba, strlen(&amp;var_ba), &amp;var_a8, ...)   <span class="tok-comment"># MD5("}")</span>

<span class="tok-comment"># hex-encode the first digest, 16 bytes → 32 hex chars into var_78</span>
<span class="tok-num">00001328</span> <span class="tok-keyword">while</span> (var_cc &lt;= <span class="tok-num">0xf</span>) {
    sprintf(&amp;var_78[var_d0], <span class="tok-string">"%02x"</span>, var_b8[var_cc]);
    var_cc++; var_d0 += <span class="tok-num">2</span>; }
<span class="tok-comment"># hex-encode the second digest into var_58</span>
<span class="tok-num">0000138e</span> <span class="tok-keyword">while</span> (var_c8 &lt;= <span class="tok-num">0xf</span>) {
    sprintf(&amp;var_58[var_d0_1], <span class="tok-string">"%02x"</span>, var_a8[var_c8]);
    var_c8++; var_d0_1 += <span class="tok-num">2</span>; }

<span class="tok-comment"># copy the 27-byte text prefix into the output key var_38</span>
<span class="tok-num">000013c6</span> <span class="tok-keyword">for</span> (var_c4 = <span class="tok-num">0</span>; var_c4 &lt;= <span class="tok-num">0x1a</span>; var_c4++)
    var_38[var_c4] = var_98[var_c4];
<span class="tok-comment"># nine key positions overwritten from the MD5 hex strings + a "}"</span>
var_15 = var_6f;  var_1c = var_78;  var_1b = var_5f;  var_1a = var_5e;
var_19 = var_5b;  var_18 = var_43;  var_17 = var_71;  var_16 = var_5f;
var_15 = var_ba.b;                                     <span class="tok-comment"># tail "}"</span>

<span class="tok-num">0000141d</span> <span class="tok-keyword">if</span> (strlen(arg1) != <span class="tok-num">0x24</span>)          <span class="tok-comment"># input must be exactly 36 chars</span>
<span class="tok-num">00001426</span> <span class="tok-keyword">else</span> <span class="tok-keyword">while</span> (true) {
<span class="tok-num">00001457</span>     <span class="tok-keyword">if</span> (arg1[var_c0_1] != var_38[var_c0_1]) <span class="tok-keyword">break</span>;  <span class="tok-comment"># byte-at-a-time compare</span>
<span class="tok-num">00001460</span>     var_c0_1++; }
<span class="tok-keyword">return</span> (loop ran <span class="tok-num">36</span> times);</code></pre>

<h3>4 · What the Code Is Actually Doing</h3>
<p>This is a <em>key generator</em>, not a <em>key verifier</em> — the correct key is synthesized on the stack at runtime:</p>
<ul>
<li><strong>Text prefix (27 bytes):</strong> the movabs constants spell <code>picoCTF{br1ng_y0ur_0wn_k3y_</code>. It is copied wholesale into the output buffer.</li>
<li><strong>MD5(prefix)</strong> and <strong>MD5("}")</strong>: each digest is hex-encoded (<code>%02x</code>) into 32-char strings. Only a handful of those characters end up in the key.</li>
<li><strong>Nine splices:</strong> the assembly later in this writeup copies nine bytes into key positions 27–35 — a mix of characters from the two hex strings and a literal <code>}</code> — producing the 36th (final) character.</li>
<li><strong>The gate:</strong> <code>strlen(arg1) != 0x24</code> rejects any key that isn't exactly 36 bytes, then a simple per-index compare loop validates your input byte-for-byte against the synthesized key.</li>
</ul>
<p>Because the entire key exists in memory, you are one debugger command away from it.</p>

<h3>5 · The GDB Disassembly — Where Everything Is</h3>
<p>Break right at the top of the checker, then dump the whole function (<code>display/120i $pc</code> or <code>layout asm</code>). The relevant region:</p>
<pre><code>gef➤ b *<span class="tok-num">0x555555555209</span>
gef➤ c
Enter your license key: <span class="tok-string">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</span>
→ 0x555555555209  endbr64
   0x55555555522e  movabs rax,<span class="tok-num">0x7b4654436f636970</span>   <span class="tok-comment"># "picoCTF{"</span>
   0x555555555238  movabs rdx,<span class="tok-num">0x30795f676e317262</span>   <span class="tok-comment"># "br1ng_y0"</span>
   0x555555555250  movabs rax,<span class="tok-num">0x6b5f6e77305f7275</span>   <span class="tok-comment"># "ur_0wn_k"</span>
   0x55555555525e  mov DWORD PTR [rbp-<span class="tok-num">0x78</span>],<span class="tok-num">0x5f7933</span>   <span class="tok-comment"># "3y_"</span>
   0x555555555265  mov WORD PTR [rbp-<span class="tok-num">0xb2</span>],<span class="tok-num">0x7d</span>       <span class="tok-comment"># "}"</span>
   <span class="tok-comment"># ── MD5(prefix) and MD5("}") ──</span>
   0x555555555294  call <span class="tok-num">0x5555555550f0</span> &lt;MD5@plt&gt;
   ...
   0x5555555552bf  call <span class="tok-num">0x5555555550f0</span> &lt;MD5@plt&gt;
   <span class="tok-comment"># ── hex-encode digest #1 (loop 0..0xf) ──</span>
   0x5555555552da  movzx eax,BYTE PTR [rbp+rax*1-<span class="tok-num">0xb0</span>]
   0x55555555530e  call sprintf@plt            <span class="tok-comment"># "%02x"</span>
   <span class="tok-comment"># ── hex-encode digest #2 (loop 0..0xf) ──</span>
   0x555555555340  movzx eax,BYTE PTR [rbp+rax*1-<span class="tok-num">0xa0</span>]
   0x555555555374  call sprintf@plt            <span class="tok-comment"># "%02x"</span>
   <span class="tok-comment"># ── copy 27-byte prefix into the key at rbp-0x30 ──</span>
   0x55555555539c  movzx edx,BYTE PTR [rbp+rax*1-<span class="tok-num">0x90</span>]
   0x5555555553b4  mov BYTE PTR [rbp+rax*1-<span class="tok-num">0x30</span>],dl    <span class="tok-comment"># key[i] = prefix[i]</span>
   <span class="tok-comment"># ── the nine splices (key[27]..key[35]) ──</span>
   0x5555555553c8  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x67</span>] ; mov [rbp-<span class="tok-num">0x15</span>],al
   0x5555555553cf  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x70</span>] ; mov [rbp-<span class="tok-num">0x14</span>],al
   0x5555555553d6  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x57</span>] ; mov [rbp-<span class="tok-num">0x13</span>],al
   0x5555555553dd  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x56</span>] ; mov [rbp-<span class="tok-num">0x12</span>],al
   0x5555555553e4  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x53</span>] ; mov [rbp-<span class="tok-num">0x11</span>],al
   0x5555555553eb  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x3b</span>] ; mov [rbp-<span class="tok-num">0x10</span>],al
   0x5555555553f2  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x69</span>] ; mov [rbp-<span class="tok-num">0x0f</span>],al
   0x5555555553f9  movzx eax,BYTE PTR [rbp-<span class="tok-num">0x57</span>] ; mov [rbp-<span class="tok-num">0x0e</span>],al
   0x555555555400  movzx eax,BYTE PTR [rbp-<span class="tok-num">0xb2</span>] ; mov [rbp-<span class="tok-num">0x0d</span>],al  <span class="tok-comment"># '}'</span>
   <span class="tok-comment"># ── the length gate and per-byte compare ──</span>
   0x555555555411  call strlen@plt
   0x555555555419  cmp rax,<span class="tok-num">0x24</span>                <span class="tok-comment"># ← break here</span>
   0x55555555541d  je  <span class="tok-num">0x555555555426</span>
   0x55555555541f  mov eax,<span class="tok-num">0x0</span>               <span class="tok-comment"># invalid</span>
   ...
   0x555555555432  movzx edx,BYTE PTR [rax]  <span class="tok-comment"># our byte</span>
   0x555555555450  movzx eax,BYTE PTR [rbp+rax*1-<span class="tok-num">0x30</span>]  <span class="tok-comment"># expected byte</span></code></pre>
<p>Note the destination offsets <code>rbp-0x30 + 0x1b ... rbp-0x30 + 0x23</code>: those are key positions 27 through 35, exactly the gap after the 27-char prefix. The tail characters are drawn from the two MD5 hex buffers — <code>hex1[0]</code>, <code>hex1[7]</code>, <code>hex1[9]</code>, <code>hex2[1]</code>, <code>hex2[2]</code>, <code>hex2[5]</code>, <code>hex2[29]</code>, <code>hex1[9]</code> again — finishing with the literal <code>}</code>.</p>

<h3>6 · Break, Then Search the Stack</h3>
<p>Now that the display buffer is in place, all that's left is to break before the compare and search live memory for the assembled string. GEF's <code>search-pattern</code> scans loaded modules and the stack in one shot:</p>
<pre><code>gef➤ b *<span class="tok-num">0x555555555419</span>
gef➤ c
...
→ 0x555555555419 cmp rax, <span class="tok-num">0x24</span>
gef➤ search-pattern picoCTF
[+] Searching <span class="tok-symbol">'picoCTF'</span> in memory
[+] In <span class="tok-symbol">'keygenme'</span>(<span class="tok-num">0x555555555000</span>-<span class="tok-num">0x555555556000</span>), permission=r-x
    <span class="tok-num">0x555555555230</span> - <span class="tok-num">0x555555555237</span> → "picoCTF[...]"
[+] In <span class="tok-symbol">'[stack]'</span>(<span class="tok-num">0x7ffffffde000</span>-<span class="tok-num">0x7ffffffff000</span>), permission=rw-
    <span class="tok-num">0x7fffffffde00</span> - <span class="tok-num">0x7fffffffde1b</span> → "picoCTF{br1ng_y0ur_0wn_k3y_"
    <span class="tok-num">0x7fffffffde60</span> - <span class="tok-num">0x7fffffffde67</span> → "picoCTF[...]"
gef➤ x/s <span class="tok-num">0x7fffffffde60</span>
<span class="tok-num">0x7fffffffde60</span>: "picoCTF{br1ng_y0ur_0wn_k3y_247d8a57}\377\177"</code></pre>
<p>The first hit is the hardcoded <code>picoCTF{</code> in the executable's own memory; the stack hits are the runtime-assembled key. The 36x bytes <code>–0xde60..</code> print almost perfectly (the trailing <code>\377\177</code> is just the stack's adjacent garbage). Typing that string back into the license prompt flips the verdict to <em>valid</em>.</p>

<h3>7 · The Flag</h3>
<pre><code>picoCTF{br1ng_y0ur_0wn_k3y_247d8a57}
<span class="tok-comment"># baked into the binary → static across all instances</span></code></pre>

<h3>8 · Retrospective</h3>
<p>Three techniques carried this solve: (1) locating code in a stripped binary through <code>__libc_start_main</code>'s hidden <code>main</code> argument or a <code>printf</code> breakpoint + <code>finish</code>; (2) recognizing that a runtime "keygen" synthesizes its own answer, so the key is guaranteed to exist in memory right before the check — making <code>search-pattern</code> on the stack a legitimate extraction primitive; and (3) disciplined use of GEF/GDB (<code>display/120i $pc</code>, targeted breakpoints on <code>strlen</code>-result compares, <code>x/s</code>) to dump what the function built without reconstructing the MD5 splicing by hand. The MD5s themselves never had to be computed — the program did that for us.</p>
