// (localStorage → Embedded <script> → fetch)
(function(){
  const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4 });
  map.doubleClickZoom.disable();

  let currentFloor = 0;
  let imageOverlay = null;
  let bounds = null;

  let deleteMode = false;

  const COLLEGES = window.__COLLEGES__ ;

  // All groups by type
  const typeGroups = {};
  const ALL_TYPES = [
    'classroom','lab','lobby','elevator','entrance','exit','stair_up','stair_down','service','restroom',
    'coffee_shop','admin_office','activity_hall','meeting_room','emergency','other'
  ];
  ALL_TYPES.forEach(t => typeGroups[t] = new L.FeatureGroup());
  const masterGroup = new L.FeatureGroup(Object.values(typeGroups)); map.addLayer(masterGroup);


  const collegeFiltersEl = document.getElementById('collegeFilters');
  const activeColleges = new Set(COLLEGES);
  COLLEGES.forEach(col => {
    const wrap=document.createElement('label'); wrap.className='filter-item';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=true; cb.dataset.college=col;
    const txt=document.createElement('span'); txt.textContent=col;
    wrap.appendChild(cb); wrap.appendChild(txt); collegeFiltersEl.appendChild(wrap);
    cb.addEventListener('change', ()=>{
      if(cb.checked) activeColleges.add(col); else activeColleges.delete(col);
      applyCollegeFilter();
    });
  });

  const floorSelect = document.getElementById('floorSelect');
  (window.__FLOOR_IMAGES__||[]).forEach((f,i)=>{
    const opt=document.createElement('option'); opt.value=i; opt.textContent=f.name; floorSelect.appendChild(opt);
  });
  floorSelect.addEventListener('change', ()=> loadFloor(parseInt(floorSelect.value,10)));

  function lsKey(){ return `floorplan_colleges_v2_floor_${currentFloor}`; }
  function lsKeyFor(idx){ return `floorplan_colleges_v2_floor_${idx}`; }

  function ingestGeoJSON(data){
    L.geoJSON(data, {
      style: featureStyle,
      pointToLayer: (feat,latlng)=> L.marker(latlng,{icon: iconFor((feat.properties||{}).type)}),
      onEachFeature: attachHandlers
    }).eachLayer(l => addToGroup(l));
  }

  // function getEmbeddedGeoJSON(floorIndex){
  //   const el = document.getElementById(`floor_${floorIndex+1}_geojson`);
  //   if (!el) return null;
  //   try { return JSON.parse(el.textContent); } catch { return null; }
  // }

  function getEmbeddedGeoJSON(floorIndex){
  if (window.__FLOOR_GEOJSON__ && window.__FLOOR_GEOJSON__[floorIndex]) {
    return window.__FLOOR_GEOJSON__[floorIndex];
  }
  return null;
}


  async function tryFetch(path){
    try{
      const res = await fetch(path);
      if(!res.ok) return null;
      return await res.json();
    }catch{ return null; }
  }
  // ============================

  function loadFloor(index){
    currentFloor = index;
    const f = window.__FLOOR_IMAGES__[index];
    const img = new Image();
    img.onload = async () => {
      const h = img.height, w = img.width;
      bounds = L.latLngBounds([h,0],[0,w]);
      if (imageOverlay) map.removeLayer(imageOverlay);
      imageOverlay = L.imageOverlay(f.file, bounds).addTo(map);
      map.fitBounds(bounds);

      Object.values(typeGroups).forEach(g => g.clearLayers());

      const saved = localStorage.getItem(lsKey());
      if (saved){
        try{ ingestGeoJSON(JSON.parse(saved)); }
        catch(e){ console.warn('Load error (localStorage)', e); }
      } else {

        const embedded = getEmbeddedGeoJSON(index);
        if (embedded){
          ingestGeoJSON(embedded);

          localStorage.setItem(lsKey(), JSON.stringify(embedded));
        } else {

          const fetched = await tryFetch(`./floor_${index+1}.geojson`) || await tryFetch(`./floor_${index+1}.geosson`);
          if (fetched){
            ingestGeoJSON(fetched);
            localStorage.setItem(lsKey(), JSON.stringify(fetched));
          } else {
            console.info('لا توجد بيانات للطابق (لا localStorage ولا Embedded ولا fetch).');
          }
        }
      }

      refreshList();
      applyCollegeFilter();
    };
    img.src = f.file;
  }

  // أيقونات
  const icon = (emoji, bg) => L.divIcon({ className:'custom-div-icon', html:`<div style="background:${bg};color:#111;padding:2px 6px;border-radius:6px;border:1px solid #333;font-size:16px;line-height:1">${emoji}</div>` });
  const ICONS = {
    elevator: icon('\uD83D\uDED7', '#f59e0b'),
    entrance: icon('\uD83D\uDEAA', '#22c55e'),
    exit:     icon('⛔', '#ef4444'),
    stair_up: icon('⤴️', '#a3a3a3'),
    stair_down: icon('⤵️', '#a3a3a3'),
    restroom: icon('\uD83D\uDEBB', '#22c55e'),
    lobby:    icon('\uD83D\uDECB️', '#14b8a6'),
    service:  icon('\uD83E\uDDF0', '#f59e0b'),
    coffee_shop: icon('☕', '#b45309'),
    admin_office: icon('\uD83C\uDFE2', '#64748b'),
    activity_hall: icon('\uD83C\uDFAF', '#ec4899'),
    meeting_room: icon('\uD83D\uDC65', '#06b6d4'),
    other:    icon('\uD83D\uDCCD', '#a3a3a3')
  };
  function iconFor(t){ return ICONS[t] || ICONS.other; }

  // ألوان
  function baseColorForType(t){
    if(t==='classroom')return '#3b82f6';
    if(t==='lab')return '#8b5cf6';
    if(t==='lobby')return '#14b8a6';
    if(t==='service')return '#f59e0b';
    if(t==='restroom')return '#22c55e';
    if(t==='coffee_shop')return '#b45309';
    if(t==='admin_office')return '#64748b';
    if(t==='activity_hall')return '#ec4899';
    if(t==='meeting_room')return '#06b6d4';
    return '#6366f1';
  }
  const PALETTE=['#0ea5e9','#8b5cf6','#14b8a6','#f59e0b','#22c55e','#ef4444','#6366f1','#ec4899','#84cc16','#06b6d4'];
  function colorByDept(dept){ if(!dept) return null; let h=0; for(let i=0;i<dept.length;i++){ h=(h*31+dept.charCodeAt(i))>>>0; } return PALETTE[h%PALETTE.length]; }

  function featureStyle(feat){
    const p=feat.properties||{}; const t=p.type||'classroom'; const deptColor=colorByDept(p.dept);
    if(t==='elevator'||t==='entrance'||t==='exit'||t==='stair_up'||t==='stair_down') return {};
    if(t==='emergency') return {color:'#ef4444',weight:5,dashArray:'8 8'};
    const color = deptColor||baseColorForType(t);
    return { color, weight:2, fillOpacity:0.25 };
  }

  // function popupHTML(p){
  //   const Ls=[]; if(p.name)Ls.push(`<b>${p.name}</b>`);
  //   if(p.number)Ls.push(`رقم: ${p.number}`);
  //   if(p.dept)Ls.push(`القسم: ${p.dept}`);
  //   if(p.college)Ls.push(`الكلية: ${p.college}`);
  //   if(p.type)Ls.push(`<small>النوع: ${p.type}</small>`);
  //   if(p.notes)Ls.push(`<small>${p.notes}</small>`);
    
  //   if (p.office_hours){
  //   const url = p.office_hours;
  //   Ls.push(
  //     `<details style="margin-top:6px; max-height:200px; overflow:auto;">
  //       <summary style="cursor:pointer; color:#0ea5e9; font-weight:bold;">
  //         🕒 عرض الساعات المكتبية
  //       </summary>
  //       <div style="margin-top:4px;">
  //         ${p.office_hours}
  //       </div>
  //     </details>`
  //   );
  // }

  //   return Ls.join('<br/>')||'عنصر';
  // }


  function popupHTML(p){
  const Ls = [];

  // المعلومات الأساسية
  if (p.name)    Ls.push(`<b>${p.name}</b>`);
  if (p.number)  Ls.push(`رقم: ${p.number}`);
  if (p.dept)    Ls.push(`القسم: ${p.dept}`);
  if (p.college) Ls.push(`الكلية: ${p.college}`);
  if (p.type)    Ls.push(`<small>النوع: ${p.type}</small>`);
  if (p.url)    Ls.push(`
  <details style="margin-top:6px; max-height:200px; overflow:auto;">
    <summary style="cursor:pointer; color:#0ea5e9; font-weight:bold;"><a href="${p.url}" target="_blank">
       🕒 عرض الساعات المكتبية
    </a> </summary>
  </details>
    `);
  if (p.notes)   Ls.push(`<small>${p.notes}</small>`);

  // // ========== جدول أسبوعي (مكاتب + معامل) من window.OFFICE_HOURS ==========
  // const allOfficeHours = window.OFFICE_HOURS || {};
  // const roomNo = p.number;                      // مثل FF-13 أو GF-30
  // const roomData = roomNo ? allOfficeHours[roomNo] : null;

  // // نطبّق الجدول فقط على: المكاتب الإدارية + المعامل
  // const isOffice = p.type === 'admin_office';
  // const isLab    = p.type === 'lab';

  // if (p.office_hours && p.type === 'admin_office'){
  //   const url = p.office_hours;
  //   Ls.push(
  //     `<details style="margin-top:6px; max-height:200px; overflow:auto;">
  //       <summary style="cursor:pointer; color:#0ea5e9; font-weight:bold;">
  //         🕒 عرض الساعات المكتبية
  //       </summary>
  //       <div style="margin-top:4px;">
  //         ${p.office_hours}
  //       </div>
  //     </details>`
  //   );
  // }
  // else if (p.office_hours && p.type === 'lab') {

  //   const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];

  //   // 1) تجميع كل "الأوقات" المميزة من جميع الدكاترة
  //   const timeSet = new Set();
  //   roomData.forEach(teacher => {
  //     (teacher.slots || []).forEach(s => {
  //       if (s.time) timeSet.add(s.time);
  //     });
  //   });
  //   let times = Array.from(timeSet);

  //   // (اختياري) محاولة ترتيب الأوقات حسب أول رقم في الفترة
  //   times.sort((a, b) => {
  //     const pa = parseInt(a, 10);
  //     const pb = parseInt(b, 10);
  //     if (isNaN(pa) || isNaN(pb)) return a.localeCompare(b, 'ar');
  //     return pa - pb;
  //   });

  //   // 2) خريطة: cell[time][day] = [اسم1, اسم2, ...]
  //   const cell = {};
  //   times.forEach(t => {
  //     cell[t] = {};
  //     DAYS.forEach(d => { cell[t][d] = []; });
  //   });

  //   roomData.forEach(teacher => {
  //     (teacher.slots || []).forEach(s => {
  //       const d = s.day;
  //       const t = s.time;
  //       if (cell[t] && cell[t][d] !== undefined) {
  //         cell[t][d].push(teacher.name);
  //       }
  //     });
  //   });

  //   //  rows of the table
  //   let rowsHtml = '';
  //   times.forEach(timeLabel => {
  //     let cellsHtml = '';
  //     DAYS.forEach(day => {
  //       const names = cell[timeLabel][day] || [];
  //       // const content = names.length
  //       //   ? '● ' + names.join('<br>● ')
  //       //   : '';
  //       cellsHtml += `
  //         <td style="padding:4px 6px; border:1px solid #ddd; text-align:center; vertical-align:top;">
  //           ${names}
  //         </td>
  //       `;
  //     });

  //     rowsHtml += `
  //       <tr>
  //         <td style="padding:4px 6px; border:1px solid #ddd; white-space:nowrap; background:#f9fafb; text-align:right;">
  //           ${timeLabel}
  //         </td>
  //         ${cellsHtml}
  //       </tr>
  //     `;
  //   });

  //   // 4) عنوان مختلف للمكاتب والمعامل فقط
  //       const summaryTitle = '🧪 جدول محاضرات / حجز المعمل';

  //       Ls.push(`
  //     <details style="margin-top:8px; max-height:260px; overflow:auto;">
  //       <summary style="cursor:pointer; font-weight:bold; ${'color:#0ea5e9;'}">
  //         ${summaryTitle}
  //       </summary>

  //       <div style="margin-top:8px;">
  //         <table style="
  //           width:100%;
  //           min-width:100%;
  //           border-collapse: collapse;
  //           table-layout: fixed;
  //           box-sizing: border-box;
  //           direction:rtl;
  //           font-size:13px;
  //           text-align:center;">

  //           <thead>
  //             <tr style="background:#e5e7eb;">
  //               <th style="padding:6px; border:1px solid #ddd; text-align:right;">الوقت</th>
  //               ${DAYS.map(d => `
  //                 <th style="padding:6px; border:1px solid #ddd;">${d}</th>
  //               `).join('')}
  //             </tr>
  //           </thead>

  //           <tbody>
  //             ${rowsHtml}
  //           </tbody>

  //         </table>
  //       </div>
  //     </details>
  //   `);


  // }
  // // ========== End of table ==========

  return Ls.join('<br/>') || 'عنصر';
}
// ----------------------------------------------------------------------------------------


  // function attachHandlers(feat, layer){
  //   layer.properties=feat.properties||{};
  //   layer.bindPopup(popupHTML(layer.properties));
  //   if(layer.properties.name && layer.bindTooltip){
  //     layer.bindTooltip(layer.properties.name,{permanent:true,direction:'center',className:'room-label'});
  //   }
  //   layer.on('dblclick', ()=> editProps(layer));
  //   layer.on('click', onLayerClickForDelete);
  // }

  function attachHandlers(feat, layer){
  layer.properties = feat.properties || {};

  layer.bindPopup(popupHTML(layer.properties), {
        className: (layer.properties.type === "lab" ? "popup-lab" : "")
    });

  if(layer.properties.name && layer.bindTooltip){
    layer.bindTooltip(layer.properties.name,{
      permanent:true,
      direction:'center',
      className:'room-label'
    });
  }

  // layer.on('dblclick', ()=> editProps(layer));
  layer.on('click',   onLayerClickForDelete);

  // // ⭐ عند فتح الـ popup نربط زر "عرض التفاصيل"
  // layer.on('popupopen', () => {
  //   const popup = layer.getPopup();
  //   const popupEl = popup.getElement();
  //   if (!popupEl) return;

  //   const toggle = popupEl.querySelector('.popup-toggle-details');
  //   const detailsEl = popupEl.querySelector('.popup-details');

  //   if (toggle && detailsEl) {
  //     toggle.addEventListener('click', (e) => {
  //       e.preventDefault();
  //       const isHidden = detailsEl.style.display === 'none' || !detailsEl.style.display;
  //       detailsEl.style.display = isHidden ? 'block' : 'none';
  //       toggle.textContent = isHidden ? '📄 إخفاء التفاصيل' : '📄 عرض التفاصيل';
  //       popup.update();
  //     });
  //   }
  // });
}


  function addToGroup(layer){
    const t=(layer.properties&&layer.properties.type)||'other';
    (typeGroups[t]||typeGroups.other).addLayer(layer);
    layer.addTo(map);
  }

  function setDeleteMode(on){
    deleteMode = !!on;
    const mapEl=document.getElementById('map');
    if(deleteMode){ mapEl.classList.add('delete-mode'); } else { mapEl.classList.remove('delete-mode'); }
  }
  function toggleDeleteMode(){ setDeleteMode(!deleteMode); }
  function onLayerClickForDelete(e){
    if(!deleteMode) return;
    const layer=e.target;
    Object.values(typeGroups).forEach(g=>{ if(g.hasLayer(layer)) g.removeLayer(layer); });
    saveAll(); refreshList();
  }

  function editProps(layer){
    const cur=layer.properties||{};
    const name=prompt('الاسم:',cur.name||'')||'';
    const number=prompt('الرقم (اختياري):',cur.number||'')||'';
    const dept=prompt('القسم:',cur.dept||'')||'';
    const collegeSel=document.getElementById('collegeSelect');
    const college=(collegeSel&&collegeSel.value)||cur.college||COLLEGES[0];
    const typeSel=document.getElementById('typeSelect');
    const type=(typeSel&&typeSel.value)||cur.type||'classroom';
    const notes=prompt('ملاحظات:',cur.notes||'')||'';
    layer.properties={name,number,dept,college,type,notes};
    if(layer.setStyle) layer.setStyle(featureStyle({properties:layer.properties,geometry:layer.toGeoJSON().geometry}));
    if(layer.setIcon) layer.setIcon(iconFor(type));
    layer.bindPopup(popupHTML(layer.properties));
    try{layer.unbindTooltip();}catch(e){}
    if(name && layer.bindTooltip){
      layer.bindTooltip(name,{permanent:true,direction:'center',className:'room-label'});
    }
    saveAll(); applyCollegeFilter(); refreshList();
  }

  const drawnItems = new L.FeatureGroup(); map.addLayer(drawnItems);
  const drawControl = new L.Control.Draw({
    position:'topright',
    draw:{ polygon:{allowIntersection:false, showArea:true, metric:false}, rectangle:true, polyline:true, marker:true, circle:false, circlemarker:false },
    edit:{ featureGroup: drawnItems }
  });
  // comment out to disable the default draw control
  // map.addControl(drawControl);
  
  map.on(L.Draw.Event.CREATED, function(e){
    const layer=e.layer;
    const type=document.getElementById('typeSelect').value||'classroom';
    const college=document.getElementById('collegeSelect').value||COLLEGES[0];
    layer.properties={type,college};
    if(e.layerType==='marker') layer.setIcon(iconFor(type));
    else if(layer.setStyle) layer.setStyle(featureStyle({properties:layer.properties,geometry:layer.toGeoJSON().geometry}));
    addToGroup(layer);
    // layer.on('dblclick', ()=> editProps(layer));
    layer.on('click', onLayerClickForDelete);
    // editProps(layer);
  });

  const searchBox=document.getElementById('searchBox');
  const resultsEl=document.getElementById('results');
  searchBox.addEventListener('input', refreshList);
  function iterLayers(cb){ Object.values(typeGroups).forEach(g=> g.eachLayer(cb)); }
  
  
  function normalizeArabic(str) {
  return str
    .normalize("NFKD")                     //  Unicode
    .replace(/[\u064B-\u065F]/g, '')       // remove (ٙ ٚ  ٜ  َ  ُ  ِ  ّ  ْ  …)
    .replace(/[أإآٱ]/g, 'ا')               // unify hamza ا
    .replace(/ء/g, '')                     
    .replace(/ؤ/g, 'و')                    // مؤ → مو
    .replace(/ئ/g, 'ي')                    // ئ → ي
    .replace(/ة/g, 'ه')                    // ة → ه 
    .replace(/ى/g, 'ي')                    // ى → ي
    .replace(/ـ/g, '')                     // Remover tatweel
    .trim();
}


  function refreshList(){
    let q=(searchBox.value||'').trim().toLowerCase();
    q = normalizeArabic(q);


    const items=[];
    iterLayers(l=>{
      const p=l.properties||{};
      const cleanOffice = (p.office_hours || '').replace(/<[^>]+>/g, ' ');

      let hay=`${p.name||''} ${p.number||''} ${p.dept||''} ${p.college||''} ${cleanOffice||''} ${p.type||''}`.toLowerCase();
      // Normalisation
      hay = normalizeArabic(hay);

      const visible=map.hasLayer(l);
      if(visible && (!q || hay.includes(q))) items.push({layer:l, props:p});
    });
    resultsEl.innerHTML='';
    if(!items.length){ resultsEl.textContent='لا توجد عناصر مطابقة.'; return; }
    const ul=document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding='0'; ul.style.margin='0';
    items.forEach(it=>{
      const li=document.createElement('li');
      li.style.padding='6px 4px'; li.style.borderBottom='1px solid #eee'; li.style.cursor='pointer';
      const name=it.props.name||it.props.type||'(بدون اسم)';
      const more=[it.props.number,it.props.dept,it.props.college].filter(Boolean).join(' · ');
      li.innerHTML=`<b>${name}</b> <span style="color:#555">${more? '— '+more:''}</span>`;
      li.onclick=()=>{
        try{ map.fitBounds(it.layer.getBounds(), {maxZoom:1}); }catch{ map.panTo(it.layer.getLatLng()); }
        it.layer.openPopup();
      };
      ul.appendChild(li);
    });
    resultsEl.appendChild(ul);
  }

  function applyCollegeFilter(){
    iterLayers(l=>{
      const col=(l.properties||{}).college;
      const show = !col || activeColleges.has(col);
      const on=map.hasLayer(l);
      if(show && !on) l.addTo(map);
      if(!show && on) map.removeLayer(l);
    });
  }

  function serialize(){
    const feats=[];
    iterLayers(l=>{
      const gj=l.toGeoJSON();
      gj.properties=l.properties||{};
      feats.push(gj);
    });
    return {type:'FeatureCollection',features:feats};
  }
  function saveAll(){ localStorage.setItem(lsKey(), JSON.stringify(serialize())); }

  function doExportGeo(){
    const data=serialize();
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`floor_${currentFloor+1}.geojson`;
    a.click();
  }
  document.getElementById('btnExportTop').addEventListener('click', doExportGeo);
  document.getElementById('btnExportSide').addEventListener('click', doExportGeo);

  document.getElementById('fileImport').addEventListener('change', ev=>{
    const f=ev.target.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const gj=JSON.parse(reader.result);
        ingestGeoJSON(gj);
        saveAll();
        applyCollegeFilter();
        refreshList();
      }catch(e){ alert('فشل الاستيراد. تأكد من صحة GeoJSON.'); }
    };
    reader.readAsText(f);
  });

  async function doExportPDF(){
    const mapEl=document.getElementById('map');
    const canvas=await html2canvas(mapEl,{useCORS:true, backgroundColor:'#ffffff', scale:2});
    const imgData=canvas.toDataURL('image/png');
    const { jsPDF }=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const pageW=pdf.internal.pageSize.getWidth();
    const pageH=pdf.internal.pageSize.getHeight();
    const margin=8;
    const availW=pageW-margin*2;
    const availH=pageH-margin*2-8;
    const imgWpx=canvas.width, imgHpx=canvas.height;
    const imgRatio=imgWpx/imgHpx;
    let drawW=availW, drawH=drawW/imgRatio;
    if(drawH>availH){ drawH=availH; drawW=drawH*imgRatio; }
    pdf.setFont('helvetica','bold'); pdf.setFontSize(14);
    pdf.text(`خريطة – ${document.getElementById('floorSelect').selectedOptions[0].text}`, margin, margin+4, {align:'left'});
    pdf.addImage(imgData,'PNG', margin, margin+8, drawW, drawH);
    pdf.save(`floor_${currentFloor+1}.pdf`);
  }
  document.getElementById('btnExportPDF').addEventListener('click', doExportPDF);
  document.getElementById('btnExportPDF_side').addEventListener('click', doExportPDF);

  document.getElementById('btnDeleteMode').addEventListener('click', toggleDeleteMode);
  document.getElementById('btnDeleteModeSide').addEventListener('click', toggleDeleteMode);
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape') setDeleteMode(false); });

  loadFloor(0);
})();

