// ---- Office hours helpers ----
function buildOfficeHoursHTML(list) {
  if (!Array.isArray(list)) return '';

  return list
    .map(entry => {
      const name = entry.name || '';

      // لو فيها slots نطبع كل يوم + وقته في سطر
      let slotsHtml = '';
      if (Array.isArray(entry.slots)) {
        slotsHtml = entry.slots
          .map(s => `${s.day || ''} ${s.time || ''}`)
          .join('<br>');
      } else if (entry.hours) {
        // دعم قديم لو استخدمت hours كنص عادي
        slotsHtml = entry.hours;
      }

      return `<b>${name}</b><br>${slotsHtml}`;
    })
    .join('<hr>'); // فراغ بين الدكاترة
}


function mergeOfficeHoursIntoProps(props) {
  if (!props) return;

  const num = props.number;
  const all = window.OFFICE_HOURS || {};
  const list = all[num];

  if (Array.isArray(list) && list.length) {
    // نخزن النسخة المنظمة لو احتجتها لاحقًا
    props.office_hours_list = list;

    // نبني HTML جاهز للـ popup والبحث
    props.office_hours = buildOfficeHoursHTML(list);
  }
}

// مرر على كل الأدوار وكل الـ features وادمج ساعات المكتب
function mergeOfficeHoursIntoAllFloors() {
  const floors = window.__FLOOR_GEOJSON__ || [];
  floors.forEach(fc => {
    if (!fc || !fc.features) return;
    fc.features.forEach(f => mergeOfficeHoursIntoProps(f.properties));
  });
}

// نفذ الدمج مباشرة أول ما يشتغل main.js
mergeOfficeHoursIntoAllFloors();
// ---- END Office hours helpers ----
