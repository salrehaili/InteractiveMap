// إضافة درج نزول + زر وضع حذف العناصر (مع الحفاظ على كل الميزات كما هي)
(function(){
  const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 4 });
  map.doubleClickZoom.disable();

  let currentFloor = 0;
  let imageOverlay = null;
  let bounds = null;

  let deleteMode = false;

  const COLLEGES = window.__COLLEGES__ || ['كلية علوم وهندسة الحاسبات','كلية الهندسة','الكلية التطبيقية'];

  // جميع الأنواع – تمت إضافة stair_down، مع الأنواع المضافة سابقًا
  const typeGroups = {};
  const ALL_TYPES = [
    'classroom','lab','lobby','elevator','entrance','exit','stair_up','stair_down','service','restroom',
    'coffee_shop','admin_office','activity_hall','meeting_room','emergency','other'
  ];
  ALL_TYPES.forEach(t => typeGroups[t] = new L.FeatureGroup());
  const masterGroup = new L.FeatureGroup(Object.values(typeGroups)); map.addLayer(masterGroup);

  // فلتر الكليات (كما هو)
  const collegeFiltersEl = document.getElementById('collegeFilters');
  const activeColleges = new Set(COLLEGES);
  COLLEGES.forEach(col => { const wrap=document.createElement('label'); wrap.className='filter-item'; const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=true; cb.dataset.college=col; const txt=document.createElement('span'); txt.textContent=col; wrap.appendChild(cb); wrap.appendChild(txt); collegeFiltersEl.appendChild(wrap); cb.addEventListener('change', ()=>{ if(cb.checked) activeColleges.add(col); else activeColleges.delete(col); applyCollegeFilter(); }); });

  // اختيار الطابق (طابقان)
  const floorSelect = document.getElementById('floorSelect');
  (window.__FLOOR_IMAGES__||[]).forEach((f,i)=>{ const opt=document.createElement('option'); opt.value=i; opt.textContent=f.name; floorSelect.appendChild(opt); });
  floorSelect.addEventListener('change', ()=> loadFloor(parseInt(floorSelect.value,10)));

  function lsKey(){ return `floorplan_colleges_v2_floor_${currentFloor}`; }

  function loadFloor(index){
    currentFloor = index;
    const f = window.__FLOOR_IMAGES__[index];
    const img = new Image();
    img.onload = () => {
      const h = img.height, w = img.width;
      bounds = L.latLngBounds([h,0],[0,w]);
      if (imageOverlay) map.removeLayer(imageOverlay);
      imageOverlay = L.imageOverlay(f.file, bounds).addTo(map);
      map.fitBounds(bounds);

      Object.values(typeGroups).forEach(g => g.clearLayers());
      const saved = localStorage.getItem(lsKey());
      if (saved){
        try{ const gj=JSON.parse(saved);
          L.geoJSON(gj, {
            style: featureStyle,
            pointToLayer: (feat,latlng)=> L.marker(latlng,{icon: iconFor((feat.properties||{}).type)}),
            onEachFeature: attachHandlers
          }).eachLayer(l => addToGroup(l));
        }catch(e){ console.warn('Load error', e); }
      }
      refreshList();
      applyCollegeFilter();
    };
    img.src = f.file;
  }

  // أيقونات للعلامات – تمت إضافة ⤵️ لدرج نزول
  const icon = (emoji, bg) => L.divIcon({ className:'custom-div-icon', html:`<div style=\"background:${bg};color:#111;padding:2px 6px;border-radius:6px;border:1px solid #333;font-size:16px;line-height:1\">${emoji}</div>` });
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

  // ألوان أساسية + لون القسم إذا وُجد
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
    if(t==='elevator'||t==='entrance'||t==='exit'||t==='stair_up'||t==='stair_down') return {}; // markers فقط
    if(t==='emergency') return {color:'#ef4444',weight:5,dashArray:'8 8'};
    const color = deptColor||baseColorForType(t);
    return { color, weight:2, fillOpacity:0.25 };
  }

  function popupHTML(p){ const Ls=[]; if(p.name)Ls.push(`<b>${p.name}</b>`); if(p.number)Ls.push(`رقم: ${p.number}`); if(p.dept)Ls.push(`القسم: ${p.dept}`); if(p.college)Ls.push(`الكلية: ${p.college}`); if(p.type)Ls.push(`<small>النوع: ${p.type}</small>`); if(p.notes)Ls.push(`<small>${p.notes}</small>`); return Ls.join('<br/>')||'عنصر'; }

  function attachHandlers(feat, layer){ layer.properties=feat.properties||{}; layer.bindPopup(popupHTML(layer.properties)); if(layer.properties.name && layer.bindTooltip){ layer.bindTooltip(layer.properties.name,{permanent:true,direction:'center',className:'room-label'});} layer.on('dblclick', ()=> editProps(layer)); layer.on('click', onLayerClickForDelete); }

  function addToGroup(layer){ const t=(layer.properties&&layer.properties.type)||'other'; (typeGroups[t]||typeGroups.other).addLayer(layer); layer.addTo(map); }

  // وضع الحذف: عند التفعيل، ضغطة على أي عنصر تزيله
  function setDeleteMode(on){ deleteMode = !!on; const mapEl=document.getElementById('map'); if(deleteMode){ mapEl.classList.add('delete-mode'); } else { mapEl.classList.remove('delete-mode'); } }
  function toggleDeleteMode(){ setDeleteMode(!deleteMode); }
  function onLayerClickForDelete(e){ if(!deleteMode) return; const layer=e.target; // احذف من مجموعته
    Object.values(typeGroups).forEach(g=>{ if(g.hasLayer(layer)) g.removeLayer(layer); });
    saveAll(); refreshList(); }

  // محرر الخصائص
  function editProps(layer){ const cur=layer.properties||{}; const name=prompt('الاسم:',cur.name||'')||''; const number=prompt('الرقم (اختياري):',cur.number||'')||''; const dept=prompt('القسم:',cur.dept||'')||''; const collegeSel=document.getElementById('collegeSelect'); const college=(collegeSel&&collegeSel.value)||cur.college||COLLEGES[0]; const typeSel=document.getElementById('typeSelect'); const type=(typeSel&&typeSel.value)||cur.type||'classroom'; const notes=prompt('ملاحظات:',cur.notes||'')||''; layer.properties={name,number,dept,college,type,notes}; if(layer.setStyle) layer.setStyle(featureStyle({properties:layer.properties,geometry:layer.toGeoJSON().geometry})); if(layer.setIcon) layer.setIcon(iconFor(type)); layer.bindPopup(popupHTML(layer.properties)); try{layer.unbindTooltip();}catch(e){} if(name && layer.bindTooltip){ layer.bindTooltip(name,{permanent:true,direction:'center',className:'room-label'});} saveAll(); applyCollegeFilter(); refreshList(); }

  // أدوات الرسم
  const drawnItems = new L.FeatureGroup(); map.addLayer(drawnItems);
  const drawControl = new L.Control.Draw({ position:'topright', draw:{ polygon:{allowIntersection:false, showArea:true, metric:false}, rectangle:true, polyline:true, marker:true, circle:false, circlemarker:false }, edit:{ featureGroup: drawnItems } });
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED, function(e){ const layer=e.layer; const type=document.getElementById('typeSelect').value||'classroom'; const college=document.getElementById('collegeSelect').value||COLLEGES[0]; layer.properties={type,college}; if(e.layerType==='marker') layer.setIcon(iconFor(type)); else if(layer.setStyle) layer.setStyle(featureStyle({properties:layer.properties,geometry:layer.toGeoJSON().geometry})); addToGroup(layer); layer.on('dblclick', ()=> editProps(layer)); layer.on('click', onLayerClickForDelete); editProps(layer); });

  // بحث/قائمة
  const searchBox=document.getElementById('searchBox'); const resultsEl=document.getElementById('results'); searchBox.addEventListener('input', refreshList);
  function iterLayers(cb){ Object.values(typeGroups).forEach(g=> g.eachLayer(cb)); }
  function refreshList(){ const q=(searchBox.value||'').trim().toLowerCase(); const items=[]; iterLayers(l=>{ const p=l.properties||{}; const hay=`${p.name||''} ${p.number||''} ${p.dept||''} ${p.college||''} ${p.type||''}`.toLowerCase(); const visible=map.hasLayer(l); if(visible && (!q || hay.includes(q))) items.push({layer:l, props:p}); }); resultsEl.innerHTML=''; if(!items.length){ resultsEl.textContent='لا توجد عناصر مطابقة.'; return; } const ul=document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding='0'; ul.style.margin='0'; items.forEach(it=>{ const li=document.createElement('li'); li.style.padding='6px 4px'; li.style.borderBottom='1px solid #eee'; li.style.cursor='pointer'; const name=it.props.name||it.props.type||'(بدون اسم)'; const more=[it.props.number,it.props.dept,it.props.college].filter(Boolean).join(' · '); li.innerHTML=`<b>${name}</b> <span style=\"color:#555\">${more? '— '+more:''}</span>`; li.onclick=()=>{ try{ map.fitBounds(it.layer.getBounds(), {maxZoom:1}); }catch{ map.panTo(it.layer.getLatLng()); } it.layer.openPopup(); }; ul.appendChild(li); }); resultsEl.appendChild(ul); }

  function applyCollegeFilter(){ iterLayers(l=>{ const col=(l.properties||{}).college; const show = !col || activeColleges.has(col); const on=map.hasLayer(l); if(show && !on) l.addTo(map); if(!show && on) map.removeLayer(l); }); }

  // حفظ/تحميل/تصدير/استيراد
  function serialize(){ const feats=[]; iterLayers(l=>{ const gj=l.toGeoJSON(); gj.properties=l.properties||{}; feats.push(gj); }); return {type:'FeatureCollection',features:feats}; }
  function saveAll(){ localStorage.setItem(lsKey(), JSON.stringify(serialize())); }

  function doExportGeo(){ const data=serialize(); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`floor_${currentFloor+1}.geojson`; a.click(); }
  document.getElementById('btnExportTop').addEventListener('click', doExportGeo);
  document.getElementById('btnExportSide').addEventListener('click', doExportGeo);

  document.getElementById('fileImport').addEventListener('change', ev=>{ const f=ev.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{ try{ const gj=JSON.parse(reader.result); L.geoJSON(gj,{ style: featureStyle, pointToLayer:(feat,latlng)=> L.marker(latlng,{icon:iconFor((feat.properties||{}).type)}), onEachFeature: attachHandlers }).eachLayer(l=> addToGroup(l)); saveAll(); applyCollegeFilter(); refreshList(); }catch(e){ alert('فشل الاستيراد. تأكد من صحة GeoJSON.'); } }; reader.readAsText(f); });

  async function doExportPDF(){ const mapEl=document.getElementById('map'); const canvas=await html2canvas(mapEl,{useCORS:true, backgroundColor:'#ffffff', scale:2}); const imgData=canvas.toDataURL('image/png'); const { jsPDF }=window.jspdf; const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}); const pageW=pdf.internal.pageSize.getWidth(); const pageH=pdf.internal.pageSize.getHeight(); const margin=8; const availW=pageW-margin*2; const availH=pageH-margin*2-8; const imgWpx=canvas.width, imgHpx=canvas.height; const imgRatio=imgWpx/imgHpx; let drawW=availW, drawH=drawW/imgRatio; if(drawH>availH){ drawH=availH; drawW=drawH*imgRatio; } pdf.setFont('helvetica','bold'); pdf.setFontSize(14); pdf.text(`خريطة – ${document.getElementById('floorSelect').selectedOptions[0].text}`, margin, margin+4, {align:'left'}); pdf.addImage(imgData,'PNG', margin, margin+8, drawW, drawH); pdf.save(`floor_${currentFloor+1}.pdf`); }
  document.getElementById('btnExportPDF').addEventListener('click', doExportPDF);
  document.getElementById('btnExportPDF_side').addEventListener('click', doExportPDF);

  // زر وضع الحذف (أعلى + جانبي)
  document.getElementById('btnDeleteMode').addEventListener('click', toggleDeleteMode);
  document.getElementById('btnDeleteModeSide').addEventListener('click', toggleDeleteMode);
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape') setDeleteMode(false); });

  loadFloor(0);
})();
