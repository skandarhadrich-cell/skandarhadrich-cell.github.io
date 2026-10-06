---
title: "JITFP — Reading a Flag That Only Exists in Live Memory"
slug: jitfp
type: re
diff: hard
platform: picoctf
read_time: 25
summary: "The function-pointer table is empty on disk and filled at runtime by a ptrace service, so read RDX at the call instead of the table."
tags: ptrace, procfs, gdb, reverse-engineering, indirect-call, function-pointers, picoctf
---
<h2>JITFP — Reading a Flag That Only Exists in Live Memory</h2>
<p>The name is the hint: <em>Just In Time Function Pointers</em>. The description says the binary "only functions properly on the host on which we found it." A stripped, statically linked musl binary called <code>ad7e550b</code> takes a 33-character candidate as <code>argv[1]</code> and validates it one character at a time. The table of function pointers that decides which character each position expects is <strong>empty in the file</strong> — not obfuscated, zero bytes, filled in at runtime by a service on the remote host. There is no static answer, so the solve has to happen inside a live process.</p>

<h3>1 · Recon</h3>
<pre><code>$ <span class="tok-func">file</span> ad7e550b
ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), statically linked,
stripped, for GNU/Linux 3.2.0
$ <span class="tok-func">strings</span> ad7e550b | <span class="tok-func">grep</span> -E <span class="tok-string">'Usage|Incorrect|Correct|sleep'</span>
Usage: %s &lt;flag&gt;
Incorrect
Correct
sleep</code></pre>
<p>Two things to note. <code>Incorrect</code> appears twice — a success and a failure path, each with its own message. And <code>sleep</code> is imported, so the loop is paced rather than free-running. Both matter later.</p>
<p>The obvious first move is a timing attack: if the checker bails out at the first wrong character, correct guesses should take marginally longer. They don't. A run takes <strong>exactly 34 seconds</strong> whatever you feed it, because <code>sleep</code> dominates and the compare is a couple of nanoseconds either way. Shorter inputs segfault — the length gate wants all 33.</p>

<h3>2 · The Decompiled main</h3>
<p>Ghidra recovers the checker loop cleanly. The call into <code>rdx</code> is worth a second look:</p>
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
<p>So nothing is encrypted or hashed. The flag is 33 choices among 65 stubs, and the only thing missing is the wiring. That's what the table at <code>0x4120</code> is for, and it is <strong>zero on disk</strong>.</p>
<pre><code>$ <span class="tok-func">readelf</span> -SW ad7e550b | <span class="tok-func">grep</span> -A1 <span class="tok-string">'.bss'</span>
<span class="tok-symbol">.bss</span>  NOBITS  <span class="tok-num">000004120</span>  ...</code></pre>
<p><code>NOBITS</code> means those bytes aren't in the file at all. None of the nine <code>.rela.dyn</code> relocations or seven <code>.rela.plt</code> JUMP_SLOTs touch that range, <code>.init_array</code> holds a single entry that tail-jumps to empty destructor boilerplate, and no constructor fills the table. Nothing in the binary can fill it. GDB agrees at runtime: the whole <code>.bss</code> range dumps as zeros, <code>RDX</code> is <code>0x0</code> at the call, and the dispatch jumps to address zero and kills the process on the first comparison.</p>
<figure><img src="/assets/ctf/jitfp/memory-map-bss.png" alt="Ghidra memory map showing the function-pointer table sitting in the NOBITS .bss segment at vaddr 0x4120" loading="lazy" decoding="async" width="1877" height="297"></figure>
<p>The shortcut here is to assume slot <em>k</em> points at the <em>k</em>-th comparator in address order, apply the permutation at <code>0x4020</code>, and read off a static flag in about two minutes. It doesn't work. The mapping is not the identity and nothing in the binary says what it is.</p>

<h3>4 · The Hint in prctl</h3>
<p>The one instruction in the binary that isn't part of the check:</p>
<pre><code>prctl(<span class="tok-num">0x59616d61</span>, <span class="tok-num">-1</span>, <span class="tok-num">0</span>, <span class="tok-num">0</span>, <span class="tok-num">0</span>);</code></pre>
<p><code>0x59616d61</code> is <code>PR_SET_PTRACER</code> and the second argument is <code>PR_SET_PTRACER_ANY</code> — the binary is explicitly asking to be ptraced by <em>anybody</em>. A flag checker has no reason to do that. It's there so something else on the host can attach and write the table into its address space, and <code>ptrace</code> is also how you read a process's memory through <code>/proc/&lt;pid&gt;/mem</code>, which is what the challenge name is pointing at.</p>
<p>So the file isn't broken. Zero in <code>.bss</code> <em>is</em> the mechanism: static analysis of this binary gives you the comparators and no wiring, because the wiring only exists in a live process.</p>

<h3>5 · Reading RDX at the Call</h3>
<p>Skip the table. The permutation and the rotation policy can both be handed to you and you can still be stuck. The checker dispatches through <code>call rdx</code> at <code>base+0x1a7d</code>:</p>
<pre><code><span class="tok-num">00101a78</span>  <span class="tok-keyword">movsx</span> eax, <span class="tok-keyword">byte</span> <span class="tok-keyword">ptr</span> [rax]      <span class="tok-comment">// argv[1][i]</span>
<span class="tok-num">00101a7b</span>  <span class="tok-keyword">mov</span>   edi, eax
<span class="tok-num">00101a7d</span>  <span class="tok-keyword">call</span>  rdx                 <span class="tok-comment">// ← the comparator for position i</span>
<span class="tok-num">00101a7f</span>  <span class="tok-keyword">test</span>  eax, eax
<span class="tok-num">00101a81</span>  <span class="tok-keyword">jnz</span>   +<span class="tok-num">0x25</span>              <span class="tok-comment">// success</span></code></pre>
<p>Whatever pointer is in <code>RDX</code> at the instant of that call <em>is</em> the answer for that position. Break there, read <code>RDX</code>, map the address to its stub, take the immediate. That holds whether the table is written once, rewritten every second, or holding noise in thirty-two of its thirty-three slots, which makes how often the service rewrites it irrelevant.</p>
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
<p>One byte makes the difference between collecting 33 characters and collecting one. The byte at <code>base+0x1a81</code> is <code>0x75</code> — a <em>short</em> <code>jnz</code> with displacement <code>+0x25</code>. Overwriting it with <code>0xEB</code> turns <code>75 25</code> into <code>EB 25</code>: an unconditional <code>jmp</code> to the identical target, which is the success path.</p>
<pre><code>write_mem(pid, base + <span class="tok-num">0x1a81</span>, <span class="tok-symbol">b"\xEB"</span>)     <span class="tok-comment"># jnz short +0x25  →  jmp short +0x25</span></code></pre>
<p>Now every comparison "passes" and the loop always reaches all 33 positions, even if a slot holds noise at the moment it's read. The check isn't weakened, it just can't abort early — which is what lets you collect 33 answers instead of the first one.</p>

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
<p>Two portability notes. Alpine has no <code>libc.so.6</code>, so bind to the interpreter's own libc with <code>ctypes.CDLL(None)</code> instead of naming the file. And only one process may ptrace a target at a time — the JIT service is itself a ptrace client — so the attach retries on <code>EBUSY</code>.</p>

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
<p>The verdict is the one piece of evidence here I didn't produce. The recovered flag goes back into a second, unpatched run of the binary and the binary itself says <code>Correct</code> — no assumed table, no supplied wiring.</p>
<p>The flag prefix is <code>academy{</code> rather than <code>picoCTF{</code>: this instance is served by CyLab Academy, which mints its own flags around the same challenge binary. <code>pr0cf5_d36ugg3r</code> — procfs debugger — points at the <code>/proc/&lt;pid&gt;/mem</code> side of the same primitive. The trailing hex is per-deployment, so it differs between instances.</p>
<p>One thing that looks like a bug and isn't: the checker prints exactly 33 asterisks whether the run succeeds or fails. It's the patched branch from step 6 — successes print one, and the failure path's compensating loop never runs because every comparison takes the success path. Don't build a progress oracle on the asterisk count.</p>

<h3>9 · Takeaway</h3>
<p>When a checker dispatches through a function pointer, the answer is in the register at the call, not in the table. Read at the moment of use, the state you need is correct by definition — so how the table gets populated stops being the question.</p>