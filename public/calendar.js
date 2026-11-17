// The previous YOGI edition's dot clock, with an explicit weekday.
// India time is used consistently with the user's selected timezone and the app greeting.
const zone='Asia/Kolkata';
const timeFormat=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:zone});
const dateFormat=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:zone});
const dayFormat=new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:zone});
const numericDate=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:zone});
let timer;
export function updateCalendar(now=new Date()){
  const clock=document.getElementById('clock'),date=document.getElementById('date'),day=document.getElementById('weekday');
  clock.textContent=timeFormat.format(now);clock.dateTime=now.toISOString();
  date.textContent=dateFormat.format(now);day.textContent=dayFormat.format(now);
  const parts=Object.fromEntries(numericDate.formatToParts(now).map(p=>[p.type,p.value]));
  date.dateTime=`${parts.year}-${parts.month}-${parts.day}`;
}
function refresh(){clearTimeout(timer);updateCalendar();timer=setTimeout(refresh,60000-Date.now()%60000+25);}
refresh();
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});
window.addEventListener('pageshow',refresh);
window.addEventListener('pagehide',()=>clearTimeout(timer));
