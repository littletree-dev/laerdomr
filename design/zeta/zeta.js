/* ── ζ 共通：色面の背景・図の描画ループ ───────────────── */
(function(){
  "use strict";
  // 色面：body の先頭に1回だけ差す
  if(!document.getElementById('zf')){
    const f=document.createElement('div'); f.id='zf'; f.setAttribute('aria-hidden','true');
    f.innerHTML='<i></i><i></i><i></i><i></i><i></i>';
    document.body.insertBefore(f,document.body.firstChild);
  }
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK='238,242,239';
  // 図：scene(ctx,w,h,t,p) を描く。t=経過秒、p=線を引き終えた割合（0→1）
  // 画面に見えていて、タブが前面のときだけ回す（電池を食わせない）
  function draw(canvas, scene){
    const ctx=canvas.getContext('2d');
    let w=0,h=0,start=performance.now(),raf=0,seen=true,alive=true;
    function size(){
      const r=canvas.getBoundingClientRect(), d=Math.min(2,window.devicePixelRatio||1);
      w=Math.max(1,r.width); h=Math.max(1,r.height);
      canvas.width=Math.round(w*d); canvas.height=Math.round(h*d);
      ctx.setTransform(d,0,0,d,0,0);
    }
    function frame(now){
      raf=0; if(!alive) return;
      const t=(now-start)/1000, p=reduce?1:Math.min(1,t/1.6);
      ctx.clearRect(0,0,w,h);
      try{ scene(ctx,w,h,reduce?0:t,ease(p)); }catch(e){}
      if(!reduce && seen && !document.hidden) raf=requestAnimationFrame(frame);
    }
    function kick(){ if(!raf) raf=requestAnimationFrame(frame); }
    size(); kick();
    let rz=0; new ResizeObserver(()=>{ if(rz) return; rz=requestAnimationFrame(()=>{ rz=0; size(); kick(); }); }).observe(canvas);
    if('IntersectionObserver' in window) new IntersectionObserver(es=>{ seen=es[0].isIntersecting; if(seen) kick(); }).observe(canvas);
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) kick(); });
    return {redraw(){ start=performance.now(); kick(); }, stop(){ alive=false; }, kick};
  }
  const ease=(x)=>1-Math.pow(1-x,3);
  // 部分的に線を引く（p=0〜1）
  function seg(ctx,a,b,p){ ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p); ctx.stroke(); }
  function ring(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); }
  function dot(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
  const ink=(a)=>'rgba('+INK+','+a+')';
  // 決まった種から乱数（同じデータなら同じ形になる）
  function rng(seed){ let s=0; for(const c of String(seed)) s=(s*31+c.charCodeAt(0))>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
  function text(ctx,s,x,y,o){ o=o||{}; ctx.font=(o.w||300)+' '+(o.size||10)+'px '+(o.font||'"IBM Plex Mono",ui-monospace,monospace');
    ctx.fillStyle=ink(o.a==null?.6:o.a); ctx.textAlign=o.align||'left'; ctx.textBaseline=o.base||'middle';
    if(o.track){ try{ ctx.letterSpacing=o.track+'px'; }catch(e){} }
    ctx.fillText(s,x,y); if(o.track){ try{ ctx.letterSpacing='0px'; }catch(e){} } }
  window.Z={draw,seg,ring,dot,ink,rng,text,reduce};

  /* ── 効果音 ──
     参照動画の音を FFT で調べると B♭マイナー・ペンタトニック（B♭ D♭ E♭ F A♭）で重みの約95%。
     半音を含まないので、どう重ねても濁らない。この5音だけで鳴らす。
     既定は切。.zproto の中の ♪ で入れる（localStorage に覚える）。音は操作の後でしか鳴らない */
  const PENTA=[466.16,554.37,622.25,698.46,830.61]; // B♭4 D♭5 E♭5 F5 A♭5
  const KEY='zeta.sound';
  let on=false, ac=null, bus=null, step=0;
  try{ on=localStorage.getItem(KEY)==='1'; }catch(e){}
  function ctx(){
    if(ac) return ac;
    const C=window.AudioContext||window.webkitAudioContext; if(!C) return null;
    ac=new C(); bus=ac.createGain(); bus.gain.value=.55;
    // 薄い残響：短い遅延を2本（部屋の鳴りの代わり）
    const d1=ac.createDelay(), d2=ac.createDelay(), f1=ac.createGain(), f2=ac.createGain(), lp=ac.createBiquadFilter();
    d1.delayTime.value=.137; d2.delayTime.value=.211; f1.gain.value=.28; f2.gain.value=.22; lp.type='lowpass'; lp.frequency.value=2600;
    bus.connect(ac.destination); bus.connect(lp); lp.connect(d1); lp.connect(d2);
    d1.connect(f1); f1.connect(d1); d2.connect(f2); f2.connect(d2); f1.connect(ac.destination); f2.connect(ac.destination);
    return ac;
  }
  // 1音：正弦波にごく弱い3倍音。立ち上がり 6ms、余韻は指数で落とす
  function note(f,t0,dur,vol){
    const o=ac.createOscillator(), o3=ac.createOscillator(), g=ac.createGain(), g3=ac.createGain();
    o.type='sine'; o.frequency.value=f; o3.type='sine'; o3.frequency.value=f*3; g3.gain.value=.06;
    g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol,t0+.006); g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    o.connect(g); o3.connect(g3); g3.connect(g); g.connect(bus); o.start(t0); o3.start(t0); o.stop(t0+dur+.05); o3.stop(t0+dur+.05);
  }
  function play(kind){
    if(!on||!ctx()) return; if(ac.state==='suspended') ac.resume();
    const t=ac.currentTime+.005;
    if(kind==='primary'){ // 3/4 の1小節：B♭ → F → D♭（上）を3拍で
      [PENTA[0],PENTA[3],PENTA[1]*2].forEach((f,i)=>note(f,t+i*.11,.9-i*.15,.07-i*.012));
    }else if(kind==='open'){ note(PENTA[2],t,.35,.035); note(PENTA[4],t+.07,.4,.03); }
    else{ note(PENTA[step%5]*(step%10>=5?1:.5),t,.28,.04); step++; }
  }
  const PRIMARY='.save,.btn.go,.primary,.go,.btn,.cmbox button,#fAdd,#fbGo,.add-btn';
  const OPEN='summary,.head,[data-a="toggle"],.more,[data-a="menu"],[data-a="cm"]';
  document.addEventListener('pointerdown',(e)=>{
    if(!on) return;
    const el=e.target.closest('button,summary,a,[role="button"],.row,.chip'); if(!el||el.disabled||el.closest('.zsnd')) return;
    play(el.matches(PRIMARY)?'primary':el.matches(OPEN)?'open':'tap');
  },{capture:true,passive:true});
  // ♪ の切り替え：試作の札（.zproto）の中に置く
  function paint(b){ b.setAttribute('aria-pressed',String(on)); b.textContent=on?'♪ on':'♪ off'; b.title=on?'効果音を切る':'効果音を入れる'; }
  function addToggle(){
    document.querySelectorAll('.zproto').forEach(p=>{ if(p.querySelector('.zsnd')) return;
      const b=document.createElement('button'); b.type='button'; b.className='zsnd'; paint(b);
      b.addEventListener('click',()=>{ on=!on; try{ localStorage.setItem(KEY,on?'1':'0'); }catch(e){}
        document.querySelectorAll('.zsnd').forEach(paint); if(on){ ctx(); play('primary'); } });
      p.appendChild(b); });
  }
  setTimeout(addToggle,0); setTimeout(addToggle,600);
  Z.play=play;
})();
