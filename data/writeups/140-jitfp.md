---
title: "JITFP — Reading a Flag That Only Exists in Live Memory"
slug: jitfp
type: re
diff: hard
platform: picoctf
read_time: 25
summary: "A checker whose function-pointer table is empty on disk and filled at runtime by a ptrace service — read RDX at the call and never touch the table."
tags: ptrace, procfs, gdb, reverse-engineering, indirect-call, function-pointers, picoctf
---
<h2>JITFP — Reading a Flag That Only Exists in Live Memory</h2>
<p>The name is the hint: <em>Just In Time Function Pointers</em>. The description says the binary "only functions properly on the host on which we found it." A stripped, statically linked musl binary called <code>ad7e550b</code> takes a 33-character candidate as <code>argv[1]</code> and validates it one character at a time — and the table of function pointers that decides which character each position expects is <strong>empty in the file</strong>. Not obfuscated, not encrypted: zero bytes, filled in at runtime by a separate service on the remote host. There is no static answer to extract, so the solve has to happen inside a live process.</p>

<h3>1 · Recon</h3>
<pre><code>$ <span class="tok-func">file</span> ad7e550b
ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), statically linked,
stripped, for GNU/Linux 3.2.0
$ <span class="tok-func">strings</span> ad7e550b | <span class="tok-func">grep</span> -E <span class="tok-string">'Usage|Incorrect|Correct|sleep'</span>
Usage: %s &lt;flag&gt;
Incorrect
Correct
sleep</code></pre>
<p>Two details worth pausing on. <code>Incorrect</code> appears twice — a success and a failure path, each with its own message. And <code>sleep</code> is imported, which means the loop is paced rather than free-running. Both matter later.</p>
<p>The obvious first move is a timing attack: if the checker bails out at the first wrong character, correct guesses should take marginally longer. They do not. A run takes <strong>exactly 34 seconds</strong> no matter what you feed it, because <code>sleep</code> dominates and the compare is a couple of nanoseconds either way. Shorter inputs segfault — the length gate wants all 33. This red herring costs an afternoon if you let it.</p>

<h3>2 · The Decompiled main</h3>
<p>Ghidra recovers the checker loop cleanly. The permissiveness of the call into <code>rdx</code> is the first thing that should bother you:</p>
<pre><code><span class="tok-comment">// FUN_00101982 — the checker</span>
i = <span class="tok-num">0</span>;
<span class="tok-keyword">while</span> (i &lt;= <span class="tok-num">32</span>) {                 <span class="tok-comment">// 33 positions</span>
  <span class="tok-keyword">if</span> (!fn_table[idx_table[i]](argv[<span class="tok-num">1</span>][i])) {  <span class="tok-comment">// indirect call through .bss</span>
    <span class="tok-keyword">return</span> puts(<span class="tok-string">"Incorrect"</span>);
  }
  i++;
}</code></pre>
<p>So <code>argv[1][i]</code> is validated by whichever function <code>fn_table</code> happens to point at. Two tables drive this: a static permutation in <code>.data</code> at vaddr <code>0x4020</code> mapping position → slot, and the pointer table itself at vaddr <code>0x4120</code>.</p>
<figure><img src="/assets/ctf/jitfp/ghidra-main-decompile.png" alt="Ghidra decompilation of the checker loop, showing the indirect call through the .bss function-pointer table" loading="lazy" decoding="async" width="749" height="752"></figure>

<h3>3 · 65 Comparators, and the Table That Holds Nothing</h3>
<p>Walking <code>.text</code> reveals 65 stub functions, each 29 bytes, laid out end to end and all the same shape:</p>
<pre><code><span class="tok-num">001011d5</span>  <span class="tok-keyword">bool</span> FUN_001011d5(<span class="tok-keyword">char</span> p) { <span class="tok-keyword">return</span> p == <span class="tok-symbol">'a'</span>; }
<span class="tok-num">001011f2</span>  <span class="tok-keyword">bool</span> FUN_001011f2(<span class="tok-keyword">char</span> p) { <span class="tok-keyword">return</span> p == <span class="tok-symbol">'b'</span>; }
<span class="tok-num">0010120f</span>  <span class="tok-keyword">bool</span> FUN_0010120f(<span class="tok-keyword">char</span> p) { <span class="tok-keyword">return</span> p == <span class="tok-symbol">'c'</span>; }</code></pre>
<p>In assembly each is <code>cmpb $imm8, -0x4(%rbp)</code> — encoded <code>80 7d fc</code> plus the character — followed by <code>ret</code>. All 65 are distinct and cover exactly the printable set:</p>
<pre><code>abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_{}</code></pre>
<p>So the flag is not encrypted or hashed anywhere: it exists as 33 choices among 65 stubs. The only thing missing is the wiring. Which is exactly what the table at <code>0x4120</code> is for — and it is <strong>zero on disk</strong>.</p>
<pre><code>$ <span class="tok-func">readelf</span> -SW ad7e550b | <span class="tok-func">grep</span> -A1 <span class="tok-string">'.bss'</span>
<span class="tok-symbol">.bss</span>  NOBITS  <span class="tok-num">000004120</span>  ...</code></pre>
<p><code>NOBITS</code> means those bytes do not exist in the file at all. Neither the nine <code>.rela.dyn</code> relocations nor the seven <code>.rela.plt</code> JUMP_SLOTs touch that range, and <code>.init_array</code> holds a single entry that tail-jumps to an empty destructor boilerplate. No constructor fills the table. Nothing in the binary can fill the table. GDB confirms it at runtime — the whole <code>.bss</code> range dumps as zeros and <code>RDX</code> is <code>0x0</code> at the call, so the dispatch jumps to address zero and the process dies on the first comparison.</p>
<figure><img src="/assets/ctf/jitfp/memory-map-bss.png" alt="Ghidra memory map showing the function-pointer table sitting in the NOBITS .bss segment at vaddr 0x4120" loading="lazy" decoding="async" width="1877" height="297"></figure>
<p>This is where the naive solve dies, and where it is worth being honest about a mistake that cost real time. It is very tempting to assume slot <em>k</em> points at the <em>k</em>-th comparator in address order, then apply the permutation at <code>0x4020</code> and be done — a complete, static, plausible-looking answer in about two minutes. I did exactly that, then wrote those guessed pointers into <code>.bss</code> with GDB, re-ran the checker, and it printed <code>Correct</code>.</p>
<p>That <code>Correct</code> was manufactured by me. I supplied the table, the checker compared my table against my flag, and the two agreed by construction. It proved nothing except that my guessed wiring was self-consistent. The tell was available: the recovered string ended in <code>a</code>, while slot 0 must serve position 32, and a real <code>picoCTF{…}</code> flag ends in <code>}</code> — which is the <em>65th</em> comparator, not the first. The mapping is not the identity, and nothing in the binary says what it is.</p>

<h3>4 · The Hint in prctl</h3>
<p>The one instruction in the binary that is not part of the check:</p>
<pre><code>prctl(<span class="tok-num">0x59616d61</span>, <span class="tok-num">-1</span>, <span class="tok-num">0</span>, <span class="tok-num">0</span>, <span class="tok-num">0</span>);</code></pre>
<p><code>0x59616d61</code> is <code>PR_SET_PTRACER</code>, and the second argument is <code>PR_SET_PTRACER_ANY</code>. The binary is explicitly asking to be ptraced by <em>anybody</em>. A flag checker has no reason to do that. It exists so something else on the host can attach and write the table into its address space — and <code>ptrace</code> is also how you read a process's memory through <code>/proc/&lt;pid&gt;/mem</code>, which is what the flag's name turns out to be nodding at.</p>
<p>So the table is not a bug and the file is not broken. Zero in <code>.bss</code> <em>is</em> the mechanism: a static analysis of this binary shows you the comparators and no wiring, because the wiring only exists in a live process.</p>

<h3>5 · Reading RDX at the Call</h3>
<p>The permutation and the rotation policy are details you can be handed and still be stuck, so the robust move is to skip the table entirely. The checker dispatches through <code>call rdx</code> at <code>base+0x1a7d</code>:</p>
<pre><code><span class="tok-num">00101a78</span>  <span class="tok-keyword">movsx</span> eax, <span class="tok-keyword">byte</span> <span class="tok-keyword">ptr</span> [rax]      <span class="tok-comment">// argv[1][i]</span>
<span class="tok-num">00101a7b</span>  <span class="tok-keyword">mov</span>   edi, eax
<span class="tok-num">00101a7d</span>  <span class="tok-keyword">call</span>  rdx                 <span class="tok-comment">// ← the comparator for position i</span>
<span class="tok-num">00101a7f</span>  <span class="tok-keyword">test</span>  eax, eax
<span class="tok-num">00101a81</span>  <span class="tok-keyword">jnz</span>   +<span class="tok-num">0x25</span>              <span class="tok-comment">// success</span></code></pre>
<p>Whatever pointer is in <code>RDX</code> at the instant of that call <em>is</em> the answer for that position. Break there, read <code>RDX</code>, map the address to its stub, take the immediate. That is correct whether the table is written once, rewritten every second, or full of noise in thirty-two of its thirty-three slots — which makes the whole question of how often the service rewrites it irrelevant.</p>
<figure><img src="/assets/ctf/jitfp/rdx-table-lookup.png" alt="Assembly of the loop body: the permutation table read at 0x4020 indexing into the function-pointer table at 0x4120 to produce the pointer loaded into RDX" loading="lazy" decoding="async" width="610" height="214"></figure>
<p>The load that matters, isolated:</p>
<figure><img src="/assets/ctf/jitfp/call-rdx.png" alt="The three instructions at the dispatch point: load argv[1][i], move it into EDI, then call rdx" loading="lazy" decoding="async" width="457" height="80"></figure>
<p>Mapping address → character is a byte scan, no offsets hardcoded:</p>
<pre><code>code = read_mem(pid, text_start, text_len)
<span class="tok-keyword">for</span> i <span class="tok-keyword">in</span> range(len(code) - <span class="tok-num">3</span>):
  <span class="tok-keyword">if</span> code[i:i+<span class="tok-num">3</span>] == <span class="tok-symbol">b"\x80\x7d\xfc"</span>:
      imm = code[i + <span class="tok-num">3</span>]
      j = i - <span class="tok-num">1</span>                                   <span class="tok-comment"># walk back to push rbp</span>
      <span class="tok-keyword">while</span> j &gt;= <span class="tok-num">0</span> <span class="tok-keyword">and</span> (i - j) &lt;= <span class="tok-num">32</span> <span class="tok-keyword">and</span> code[j] != <span class="tok-num">0x55</span>:
          j -= <span class="tok-num">1</span>
      <span class="tok-keyword">if</span> j &gt;= <span class="tok-num">0</span> <span class="tok-keyword">and</span> code[j] == <span class="tok-num">0x55</span>:
          table[j] = chr(imm)                  <span class="tok-comment"># stub start → expected char</span></code></pre>
<p>That finds all 65 stubs in the live process.</p>

<h3>6 · Neutralising the Failure Branch</h3>
<p>One byte makes the difference between collecting 33 characters and collecting none. The byte at <code>base+0x1a81</code> is <code>0x75</code> — a <em>short</em> <code>jnz</code> with displacement <code>+0x25</code>. Overwriting it with <code>0xEB</code> turns <code>75 25</code> into <code>EB 25</code>: an unconditional <code>jmp</code> to the identical target, which is the success path.</p>
<pre><code>write_mem(pid, base + <span class="tok-num">0x1a81</span>, <span class="tok-symbol">b"\xEB"</span>)     <span class="tok-comment"># jnz short +0x25  →  jmp short +0x25</span></code></pre>
<p>Now every comparison "passes" and the loop is guaranteed to reach all 33 positions, even if a slot holds noise at the moment it is read. You are not weakening the check — you are removing its ability to abort early, which is what lets you observe all 33 answers instead of the first one.</p>

<h3>7 · The Loop</h3>
<p>Attach, plant <code>0xCC</code> on the <code>call rdx</code>, then per position: wait for the trap, <code>PTRACE_GETREGS</code>, read <code>RDX</code>, restore the original byte, rewind <code>RIP</code> to the call, single-step so the call actually executes, re-plant <code>0xCC</code>, continue.</p>
<pre><code>ptrace(PTRACE_ATTACH, pid, <span class="tok-num">0</span>, <span class="tok-num">0</span>); waitpid(pid)
write_mem(pid, bp, <span class="tok-symbol">b"\xCC"</span>); ptrace(PTRACE_CONT, pid, <span class="tok-num">0</span>, <span class="tok-num">0</span>)

<span class="tok-keyword">for</span> position <span class="tok-keyword">in</span> range(<span class="tok-num">33</span>):
    waitpid(pid)
    regs = UserRegs(); ptrace(PTRACE_GETREGS, pid, <span class="tok-num">0</span>, ctypes.addressof(regs))
    flag.append(char_map.get(regs.rdx - text_start, <span class="tok-string">"?"</span>))

    write_mem(pid, bp, original)          <span class="tok-comment"># undo the trap</span>
    regs.rip = bp
    ptrace(PTRACE_SETREGS, pid, <span class="tok-num">0</span>, ctypes.addressof(regs))
    ptrace(PTRACE_SINGLESTEP, pid, <span class="tok-num">0</span>, <span class="tok-num">0</span>); waitpid(pid)
    write_mem(pid, bp, <span class="tok-symbol">b"\xCC"</span>)                <span class="tok-comment"># re-arm</span>
    ptrace(PTRACE_CONT, pid, <span class="tok-num">0</span>, <span class="tok-num">0</span>)</code></pre>
<p>Two portability notes, both of which cost a run each. On Alpine there is no <code>libc.so.6</code>, so bind to the interpreter's own libc with <code>ctypes.CDLL(None)</code> rather than naming the file. And only one process may ptrace a target at a time — the JIT service is itself a ptrace client — so the attach retries on <code>EBUSY</code> instead of giving up.</p>

<h3>8 · The Flag</h3>
<pre><code>[*] comparators    : <span class="tok-num">65</span> found
[*] patched <span class="tok-num">0x587847722a81</span>: jnz -&gt; jmp (always take success)
  pos  <span class="tok-num">0</span>  rdx=<span class="tok-num">0x5878477221d5</span>  -&gt;  <span class="tok-symbol">'a'</span>   (table <span class="tok-num">33</span>/<span class="tok-num">33</span> non-zero)
  pos  <span class="tok-num">1</span>  rdx=<span class="tok-num">0x58784772220f</span>  -&gt;  <span class="tok-symbol">'c'</span>   (table <span class="tok-num">33</span>/<span class="tok-num">33</span> non-zero)
  pos  <span class="tok-num">2</span>  rdx=<span class="tok-num">0x5878477221d5</span>  -&gt;  <span class="tok-symbol">'a'</span>   (table <span class="tok-num">33</span>/<span class="tok-num">33</span> non-zero)
  ...
  pos <span class="tok-num">32</span>  rdx=<span class="tok-num">0x587847722915</span>  -&gt;  <span class="tok-symbol">'}'</span>   (table <span class="tok-num">33</span>/<span class="tok-num">33</span> non-zero)

flag (<span class="tok-num">33</span> chars) : academy{pr0cf5_d36ugg3r_86cd7eae}
could not write flag.txt: [Errno <span class="tok-num">30</span>] Read-only file system
[*] verifying: /home/ctf-player/ad7e550b academy{pr0cf5_d36ugg3r_86cd7eae}
[*] checker output: <span class="tok-num">32</span> <span class="tok-string">'='</span>, <span class="tok-string">'v'</span>, <span class="tok-num">33</span> <span class="tok-string">'*'</span>
[*] verdict       : Correct</code></pre>
<p>Worth stopping on that verdict, because it is the one piece of evidence in the whole write-up that is not mine. The recovered flag is fed back to a second, unpatched run of the binary and the binary itself says <code>Correct</code>. Nothing I did to make that happen — no assumed table, no supplied wiring. That is the difference between a guess and a result.</p>
<p>The flag prefix is <code>academy{</code> rather than <code>picoCTF{</code>: this instance is served by CyLab Academy, which mints its own flags around the same challenge binary. <code>pr0cf5_d36ugg3r</code> — procfs debugger — is the author pointing at the <code>/proc/&lt;pid&gt;/mem</code> side of the same primitive. The trailing hex is per-deployment, so it differs between instances.</p>
<p>One measurement worth recording, because it looks like a bug and is not. The checker prints exactly 33 asterisks whether the run succeeds or fails, and the reason is the patched branch from step 6: successes print one, and the failure path's compensating loop no longer runs because every comparison now takes the success path. The asterisk count carries <strong>no</strong> information about progress — don't build an oracle on it.</p>

<h3>9 · Retrospective</h3>
<p>Two lessons, one technical and one about method.</p>
<p>Technically: when a checker dispatches through a function pointer, the answer is in the register at the call, not in the table. Breaking at the indirect call and reading <code>RDX</code> sidesteps the entire question of how the table is populated — once per run, once per second, or a rotating diagonal with noise in thirty-two of thirty-three slots. All the write-ups I found disagreed about that policy and it did not matter. Read at the moment of use, the state you need is by definition correct.</p>
<p>Methodologically: I treated my own static analysis as authoritative over a statement the challenge author had made directly, and so "proved" the local binary could not work and dismissed the remote host as the explanation. In a CTF handed to you over SSH, a checker that only runs on the host it was found on is not a puzzle — it is the setup, and the interesting part is what the remote host is doing to the process. I burned hours proving something that was never in question, then manufactured a green checkmark by supplying the answer myself. A verification that depends on input you provided is not a verification.</p>