(()=>{
  const fmt=t=>{if(!isFinite(t)) return '00:00'; const m=Math.floor(t/60), s=Math.floor(t%60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

  // UI elements
  const file=document.getElementById('file');
  const playBtn=document.getElementById('play');
  const stopBtn=document.getElementById('stop');
  const platter=document.getElementById('platter');
  const readout=document.getElementById('readout');
  const tempo=document.getElementById('tempo');
  const tempoVal=document.getElementById('tempoVal');
  const rpm33=document.getElementById('rpm33');
  const rpm45=document.getElementById('rpm45');
  const cutoff=document.getElementById('cutoff');
  const cutVal=document.getElementById('cutVal');
  const echo=document.getElementById('echo');
  const echoVal=document.getElementById('echoVal');
  const nudgeL=document.getElementById('nudgeL');
  const nudgeR=document.getElementById('nudgeR');
  const setCue=document.getElementById('setCue');
  const goCue=document.getElementById('goCue');
  const back1=document.getElementById('back1');
  const fwd1=document.getElementById('fwd1');
  const cueLbl=document.getElementById('cueLbl');

  // Media element (no source yet)
  const audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';   // safe for blob: URLs too
  let duration=0, rpm=33.33, cue=null; 
  let playing=false;

  // WebAudio graph (lazy)
  let AC=null, src=null, lp=null, delay=null, fb=null, mix=null;
  async function ensureAudioGraph(){
    if(AC) return;
    AC = new (window.AudioContext||window.webkitAudioContext)();
    src = AC.createMediaElementSource(audio);

    lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=8000;

    delay = AC.createDelay(1.0);
    fb = AC.createGain(); fb.gain.value=0.35;
    mix = AC.createGain(); mix.gain.value=0.0;

    // dry
    src.connect(lp).connect(AC.destination);
    // wet
    src.connect(delay).connect(fb).connect(delay);
    delay.connect(mix).connect(AC.destination);
  }

  // --- Visual rotation + inertia engine ---
  let angle=0, lastTs=null, backspinV=0, inertia=false;
  function tick(ts){
    if(lastTs==null) lastTs=ts; const dt=(ts-lastTs)/1000; lastTs=ts;

    if(playing && !inertia){
      const rps=rpm/60;
      angle += rps*2*Math.PI*dt;
    }
    if(inertia){
      audio.currentTime = clamp(audio.currentTime + backspinV*dt, 0, duration);
      const secondsPerTurn=1.8;
      const omega=(backspinV/secondsPerTurn)*2*Math.PI;
      angle += omega*dt;
      backspinV *= 0.94;
      if(Math.abs(backspinV) < 0.02){ inertia=false; if(playing){ audio.play().catch(()=>{}); } }
    }
    platter.style.transform = `rotate(${angle}rad)`;
    readout.textContent = `${fmt(audio.currentTime)} / ${fmt(duration)} | ${rpm===33.33?'33⅓':'45'} RPM`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Helpers
  const rateFromTempo=()=> 1 + (parseFloat(tempo.value)||0)/100;

  // File load
  file.addEventListener('change', e=>{
    const f=e.target.files && e.target.files[0];
    if(!f) return;
    // Revoke old blob URL if any
    if(audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(f);
    audio.load();
    audio.addEventListener('loadedmetadata',()=>{
      duration = audio.duration || 0;
    }, {once:true});
  });

  // Transport
  playBtn.onclick = async ()=>{
    if(!audio.src){
      alert('Choose an audio file first.');
      file.click();
      return;
    }
    await ensureAudioGraph();
    if(AC.state==='suspended'){ try{ await AC.resume(); }catch(e){} }

    try{
      if(!playing){
        audio.playbackRate = rateFromTempo();
        await audio.play();                 // may throw if policy blocks
        playing=true;
        playBtn.textContent='⏸ Pause';
      }else{
        audio.pause();
        playing=false;
        playBtn.textContent='▶ Play';
      }
    }catch(err){
      console.error('Playback error:', err);
      alert('Playback was blocked by the browser. Click the page and press Play again, or try a different audio file.');
    }
  };

  // Gentle brake on stop
  stopBtn.onclick=()=>{
    if(!playing){ audio.currentTime=0; return; }
    playing=false;
    const start=performance.now();
    const startRate=audio.playbackRate;
    const BRAKE=400;
    const step=(t)=>{
      const u=Math.min(Math.max((t-start)/BRAKE,0),1);
      audio.playbackRate = startRate*(1-u);
      if(u<1) requestAnimationFrame(step);
      else { audio.pause(); audio.currentTime=0; audio.playbackRate=rateFromTempo(); playBtn.textContent='▶ Play'; }
    };
    requestAnimationFrame(step);
  };

  // Tempo & RPM
  tempo.oninput=()=>{ const r=rateFromTempo(); audio.playbackRate=r; tempoVal.textContent=((r-1)*100).toFixed(1)+'%'; };
  rpm33.onclick=()=>{ rpm=33.33; };
  rpm45.onclick=()=>{ rpm=45; };
  nudgeL.onclick=()=>{ audio.playbackRate=rateFromTempo()-0.04; setTimeout(()=>audio.playbackRate=rateFromTempo(),120); };
  nudgeR.onclick=()=>{ audio.playbackRate=rateFromTempo()+0.04; setTimeout(()=>audio.playbackRate=rateFromTempo(),120); };

  // Filter & Echo
  cutoff.oninput=()=>{ if(!AC) return; lp.frequency.setValueAtTime(parseFloat(cutoff.value), AC.currentTime); cutVal.textContent = lp.frequency.value>=7900?'open': Math.round(lp.frequency.value)+' Hz'; };
  echo.oninput=()=>{ if(!AC) return; mix.gain.value=parseFloat(echo.value); echoVal.textContent=Math.round(mix.gain.value*100)+'%'; };

  // Cue
  setCue.onclick=()=>{ cue=audio.currentTime; cueLbl.textContent='Cue: '+fmt(cue); };
  goCue.onclick =()=>{ if(cue!=null){ audio.currentTime=cue; } };
  back1.onclick =()=>{ audio.currentTime=Math.max(0,audio.currentTime-1); };
  fwd1.onclick  =()=>{ audio.currentTime=Math.min(duration, audio.currentTime+1); };

  // Scratching
  let scratching=false, lastAng=0, lastT=0, vel=0;
  const secondsPerTurn=1.8;
  const getAng=(x,y)=>{ const r=platter.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; return Math.atan2(y-cy,x-cx); };

  const onDown=(e)=>{
    scratching=true; platter.style.cursor='grabbing'; inertia=false;
    const pt = ('touches' in e) ? e.touches[0] : e;
    lastAng=getAng(pt.clientX, pt.clientY); lastT=performance.now();
    // Pause audio while actively scratching for tight control
    if(playing) audio.pause();
  };
  const onMove=(e)=>{
    if(!scratching) return;
    const pt = ('touches' in e) ? e.touches[0] : e;
    const ang=getAng(pt.clientX, pt.clientY);
    let d=ang-lastAng; if(d>Math.PI) d-=Math.PI*2; if(d<-Math.PI) d+=Math.PI*2; lastAng=ang;

    const now=performance.now(); const dt=(now-lastT)/1000; lastT=now;
    const deltaT = (d/(2*Math.PI))*secondsPerTurn;
    audio.currentTime = Math.min(Math.max(audio.currentTime + deltaT, 0), duration);
    vel = deltaT/dt;
    angle += d;
  };
  const onUp=()=>{
    if(!scratching) return; scratching=false; platter.style.cursor='grab';
    if(Math.abs(vel) > 0.4){ inertia=true; backspinV = vel; } 
    else { inertia=false; if(playing){ audio.play().catch(()=>{}); } }
  };

  // Pointer/touch
  platter.addEventListener('pointerdown', (e)=>{ e.preventDefault(); onDown(e); });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  platter.addEventListener('touchstart', (e)=>{ e.preventDefault(); onDown(e); }, {passive:false});
  window.addEventListener('touchmove', (e)=>{ onMove(e); }, {passive:false});
  window.addEventListener('touchend', onUp);

  audio.onended=()=>{ playing=false; playBtn.textContent='▶ Play'; };
})();
