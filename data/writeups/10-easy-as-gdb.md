---
title: "Easy as GDB — Scripted Character-by-Character Brute Force"
slug: easy-as-gdb
type: re
diff: hard
platform: picoctf
read_time: 17
summary: "The flag is validated one character at a time, so automate it: script GDB to brute-force the key space inside a single session."
tags: gdb, scripting, brute-force, bruteforce, picoctf, reveng
---
<h2>Easy as GDB — Scripted Character-by-Character Brute Force</h2>
<p>A single challenge description line — <em>"The flag has got to be checked somewhere..."</em> — is almost the whole solution. The attached 32-bit ELF (<code>brute</code>) asks for a flag candidate, encodes it on the fly, then walks the encoded bytes against the stored encoded flag one position at a time, aborting at the first mismatch. That per-byte compare is an oracle you can mine directly: set a breakpoint on the compare instruction, count hits, and read <code>AL</code>/<code>DL</code> to decide each character. This is the challenge that GDB's Python scripting API was made for.</p>

<h3>1 · First Run — Meet the Oracle</h3>
<p>The program is a key checker, not a vault:</p>
<pre><code><span class="tok-func">chmod</span> +x brute
<span class="tok-func">./brute</span>
input the flag: <span class="tok-string">test</span>
checking solution...
Incorrect.</code></pre>
<p><code>strings brute</code> yields only UI literals (<code>input the flag:</code>, <code>checking solution...</code>, <code>Correct!</code>/<code>Incorrect.</code>) — no plaintext flag, because the flag is stored <em>encoded</em>. The description is literal: the flag really is "checked somewhere", and that somewhere is a compare loop.</p>

<h3>2 · Static Pass in Ghidra</h3>
<p>Decompiling <code>main</code> shows the pipeline: read up to <code>0x200</code> bytes, measure the stored encoded flag, pre-encode our input, then hand everything to <code>check_flag</code>:</p>
<pre><code>user_input = calloc(<span class="tok-num">0x200</span>,1);
printf("input the flag: ");
fgets(user_input,<span class="tok-num">0x200</span>,stdin);
encoded_flag_len = strnlen(&amp;g_encoded_flag,<span class="tok-num">0x200</span>);
user_input = FUN_0001082b(user_input,encoded_flag_len);
FUN_000107c2(user_input,encoded_flag_len,<span class="tok-num">1</span>);
iVar1 = check_flag(user_input,encoded_flag_len);
if (iVar1 == <span class="tok-num">1</span>) puts("Correct!"); else puts("Incorrect.");</code></pre>
<p><code>g_encoded_flag</code> is a blob of bytes at <code>0x12008</code> that makes no sense as text (<code>7a 2e 6e 68 1d 65 16 7c 6d 43 6f 36 63 62 14 47 ...</code>). You are meant to recover the input value that encodes into it, not read it off.</p>

<h3>3 · check_flag Aborts at the First Mismatch</h3>
<pre><code>undefined4 check_flag(char *user_input, uint encoded_flag_len)
{
  __dest   = calloc(encoded_flag_len + 1, 1);
  strncpy(__dest, user_input, encoded_flag_len);
  FUN_000107c2(__dest, encoded_flag_len, -1);
  __dest_00 = calloc(encoded_flag_len + 1, 1);
  strncpy(__dest_00, &amp;g_encoded_flag, encoded_flag_len);
  FUN_000107c2(__dest_00, encoded_flag_len, -1);
  puts("checking solution...");
  i = <span class="tok-num">0</span>;
  while (true) {
    if (encoded_flag_len &lt;= i) return 1;            <span class="tok-comment"># all matched</span>
    if (__dest[i] != __dest_00[i]) break;           <span class="tok-comment"># first mismatch → abort</span>
    i = i + 1;
  }
  return <span class="tok-num">0xffffffff</span>;                              <span class="tok-comment"># i.e. -1</span>
}</code></pre>
<p>Three things follow, and all of them come back to the same property: the loop stops the moment it finds a wrong byte.</p>
<ul>
<li>The check returns only once the <em>entire</em> prefix is correct — a wrong byte anywhere stops the loop, so a run with prefix <code>flag + c</code> either completes a compare for position <code>len(flag)</code> or dies earlier.</li>
<li>Both buffers get the same post-transform before comparison, so you never need to invert the encoding — the byte that must equal yours is computed <em>inside</em> the loop, sitting in a register at the compare.</li>
<li>Correct guesses make the loop go one position further. That's the oracle.</li>
</ul>

<h3>4 · Where the Compare Lives</h3>
<pre><code>56555978  MOV EDX,[EBP + local_14]      <span class="tok-comment"># base of buffer A (from g_encoded_flag)</span>
5655597b  MOV EAX,[EBP + i]
5655597e  ADD EAX,EDX
56555980  MOVZX EDX, byte [EAX]         <span class="tok-comment"># DL = expected byte for position i</span>
56555983  MOV ECX,[EBP + local_10]      <span class="tok-comment"># base of buffer B (our encoded input)</span>
56555986  MOV EAX,[EBP + i]
56555989  ADD EAX,ECX
5655598b  MOVZX EAX, byte [EAX]         <span class="tok-comment"># AL = our encoded byte for position i</span>
5655598e  CMP DL, AL                    <span class="tok-comment"># ← break here and read both bytes</span>
56555990  JZ   LAB_5655599b             <span class="tok-comment"># equal → i++</span>
56555992  MOV  [EBP + local_1c], 0xffffffff
56555999  JMP  LAB_565559a7             <span class="tok-comment"># mismatch → return -1</span>
5655599b  ADD  [EBP + i], 0x1
5655599f  MOV  EAX,[EBP + i]
565559a2  CMP  EAX,[EBP + encoded_flag_len]   <span class="tok-comment"># loop limit → exposes flag length</span>
565559a5  JC   LAB_56555978</code></pre>
<p>Note the <code>MOVZX</code> loads: at <code>5655598e</code> both the expected byte and our byte are live in <code>DL</code> and <code>AL</code>. One register read leaks the answer for the current position. The compare at <code>565559a2</code> doubles as a length oracle — breaking there shows the flag is <strong>30 bytes</strong>.</p>

<h3>5 · The Encoding, for Reference</h3>
<p>The flag isn't in the binary because <code>g_encoded_flag</code> is the flag put through a transform: a byte-lane XOR against a rolling constant starting at <code>0xabcf00d</code> and striding by <code>0x1fab4d</code> to <code>0xdeadbeef</code>, each constant's four bytes xored into positions <code>i&amp;3</code>, followed by an interleaving swap. Both buffers get the same transform before the compare, so inverting it in Python is a valid alternative solve. The GDB route skips all of it.</p>

<h3>6 · The GDB Script</h3>
<p>A custom <code>gdb.Breakpoint</code> subclass with a hit counter acts as a <em>conditional breakpoint</em>: for a candidate at position <code>i</code> we want the <code>(i+1)</code>-th hit of the compare (positions <code>0..i-1</code> each produce one hit first). A second breakpoint on the <code>puts("Correct!")</code> marks full success.</p>
<pre><code><span class="tok-keyword">import</span> gdb
<span class="tok-keyword">import</span> string
<span class="tok-keyword">from</span> queue <span class="tok-keyword">import</span> Queue, Empty

MAX_FLAG_LEN = <span class="tok-num">0x200</span>

<span class="tok-keyword">class</span> Checkpoint(gdb.Breakpoint):
    <span class="tok-keyword">def</span> __init__(<span class="tok-keyword">self</span>, queue, target_hitcount, *args):
        super().__init__(*args)
        self.silent = <span class="tok-keyword">True</span>
        self.queue = queue
        self.target_hitcount = target_hitcount
        self.hit = <span class="tok-num">0</span>

    <span class="tok-keyword">def</span> stop(<span class="tok-keyword">self</span>):
        self.hit += <span class="tok-num">1</span>
        <span class="tok-keyword">if</span> self.hit == self.target_hitcount:
            al = gdb.parse_and_eval(<span class="tok-string">"$al"</span>)
            dl = gdb.parse_and_eval(<span class="tok-string">"$dl"</span>)
            self.queue.put(al == dl)      <span class="tok-comment"># our byte == expected byte?</span>
        <span class="tok-keyword">return</span> <span class="tok-keyword">False</span>                      <span class="tok-comment"># keep running, never stop interactively</span>

<span class="tok-keyword">class</span> Solvepoint(gdb.Breakpoint):
    <span class="tok-keyword">def</span> __init__(<span class="tok-keyword">self</span>, *args):
        super().__init__(*args)
        self.silent = <span class="tok-keyword">True</span>
        self.hit = <span class="tok-num">0</span>

    <span class="tok-keyword">def</span> stop(<span class="tok-keyword">self</span>):
        self.hit += <span class="tok-num">1</span>
        <span class="tok-keyword">return</span> <span class="tok-keyword">False</span>

gdb.execute(<span class="tok-string">"set disable-randomization on"</span>)   <span class="tok-comment"># keep the runtime addresses stable</span>
gdb.execute(<span class="tok-string">"delete"</span>)
sp = Solvepoint(<span class="tok-string">"*0x56555a71"</span>)              <span class="tok-comment"># the push before puts("Correct!")</span>
queue = Queue()

flag = <span class="tok-string">""</span>
ALPHABET = string.ascii_letters + string.digits + <span class="tok-string">"{}_"</span>

<span class="tok-keyword">for</span> i <span class="tok-keyword">in</span> range(len(flag), MAX_FLAG_LEN):
    <span class="tok-keyword">for</span> c <span class="tok-keyword">in</span> ALPHABET:
        bp = Checkpoint(queue, len(flag) + <span class="tok-num">1</span>, <span class="tok-string">'*0x5655598e'</span>)
        gdb.execute(<span class="tok-string">"run &lt;&lt;&lt; {}{}"</span>.format(flag, c))   <span class="tok-comment"># feed the candidate on stdin</span>
        <span class="tok-keyword">try</span>:
            result = queue.get(timeout=<span class="tok-num">1</span>)
            bp.delete()
            <span class="tok-keyword">if</span> result:
                flag += c
                print(<span class="tok-string">"{}\n"</span>.format(flag))     <span class="tok-comment"># growing prefix, printed live</span>
                <span class="tok-keyword">break</span>
        <span class="tok-keyword">except</span> Empty:
            print(<span class="tok-string">"Error: Empty queue!"</span>)
            gdb.execute(<span class="tok-string">"q"</span>)

    <span class="tok-keyword">if</span> sp.hit &gt; <span class="tok-num">0</span>:
        print(<span class="tok-string">"Found flag: {}"</span>.format(flag))
        gdb.execute(<span class="tok-string">"q"</span>)</code></pre>

<h3>7 · How the Mechanics Work</h3>
<ul>
<li><strong>Hit counting, not conditions:</strong> <code>Checkpoint</code> with <code>target_hitcount = len(flag)+1</code> ignores the compare hits for all positions before the one we're solving, then, on exactly that hit, evaluates <code>al == dl</code>. A wrong char never reaches that many hits (the loop aborted early), so it reports failure via an empty-queue timeout.</li>
<li><strong>One process per probe:</strong> each guess is a fresh <code>run</code>, so the trace is clean and countable. The Bash here-string <code>run &lt;&lt;&lt; {flag}{c}</code> pipes the candidate into the inferior's stdin — shorter and reliable than generator tricks.</li>
<li><strong>Silent breakpoints:</strong> <code>silent = True</code> plus <code>stop()</code> returning <code>False</code> means GDB never drops into the interactive prompt; the script stays in control.</li>
<li><strong>Success detection:</strong> when the prefix reaches the real flag, the solver still keeps probing characters, but the program now reaches the <code>puts("Correct!")</code> breakpoint (<code>sp</code>) — one hit means done.</li>
<li><strong>Address stability:</strong> <code>set disable-randomization on</code> pins the PIE base so the hardcoded runtime addresses (<code>0x5655598e</code>, <code>0x56555a71</code>) remain valid. These addresses are specific to the released build — re-derive them from <code>disas main</code>/an objdump if needed.</li>
</ul>

<h3>8 · Running It</h3>
<pre><code><span class="tok-func">gdb</span> -n -q -ex <span class="tok-string">"set pagination off"</span> -ex <span class="tok-string">"source solve.py"</span> ./brute
<span class="tok-comment"># one run per candidate; the growing prefix prints live:</span>
<span class="tok-comment"># pico … picoC … picoCT … picoCTF{ … etc.</span>
Breakpoint 1196 at <span class="tok-num">0x5655598e</span>
input the flag: checking solution...
Correct!

picoCTF{I_5D3_A11DA7_0db137a9}

Found flag: picoCTF{I_5D3_A11DA7_0db137a9}</code></pre>
<p>The whole 30-character flag recovers in a couple of minutes of scripted probes. Compare that with manually stepping 1196 breakpoint hits.</p>

<h3>9 · The Flag</h3>
<pre><code>picoCTF{I_5D3_A11DA7_&lt;HASH&gt;}
<span class="tok-comment"># prefix is constant; the trailing hex differs per instance build.</span>
<span class="tok-comment"># public instances end e.g. _0db137a9 or _6aa8dd3b</span></code></pre>

<h3>10 · What Made It Work</h3>
<p>The side channel here isn't timing, it's hit counting. A fail-fast compare tells you how many leading characters were right by how far it got before returning, which is a slower oracle than reading memory but doesn't require knowing the encoding at all. That's the point: the encoding in step 5 is a distraction you can skip entirely because the compare is sitting in a register either way.</p>
<p>GDB's Python API is what makes the brute force practical. A <code>gdb.Breakpoint</code> subclass with a hit counter turns "conditional breakpoint" into arbitrary logic evaluated at a given hit, so the loop over candidates stays inside one session instead of relaunching per guess.</p>
