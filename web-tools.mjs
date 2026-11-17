export function imageQuery(message,forced=false){
  if(!forced&&!/\b(images?|photos?|pictures?|photographs?)\b/i.test(message))return '';
  const subject=message.match(/\b(?:images?|photos?|pictures?|photographs?)\s+(?:of|for)\s+([^.!?\n]+)/i);
  if(subject)return subject[1].split(/\s+and\s+(?:tell|explain|describe|summarize)\b/i)[0].trim().slice(0,200);
  return message.replace(/^(?:please\s+)?(?:can you\s+|could you\s+)?(?:show|find|give|search|look)(?:\s+(?:me|us|online|the web|web|for))*\s*/i,'')
    .replace(/\b(?:and\s+)?(?:provide|include|show|find|give)(?:\s+me)?\s+(?:some\s+)?(?:images?|photos?|pictures?)(?:\s+of)?\b/gi,' ')
    .replace(/\b(?:images?|photos?|pictures?|photographs?)\s*(?:of|for)?\b/gi,' ')
    .replace(/^\s*(?:of|for)\s+/i,'').replace(/\s+/g,' ').replace(/[?.!]+$/,'').trim().slice(0,200);
}
const plain=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,250);
export function normalizeImages(data){
  return Object.values(data?.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).flatMap(page=>{
    const info=page.imageinfo?.[0],meta=info?.extmetadata||{};
    if(!info?.mime?.startsWith('image/')||!info.thumburl||!info.descriptionurl)return [];
    let thumb,source;try{thumb=new URL(info.thumburl);source=new URL(info.descriptionurl);}catch{return [];}
    if(thumb.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(thumb.hostname)||source.protocol!=='https:'||source.hostname!=='commons.wikimedia.org')return [];
    return [{title:plain(page.title.replace(/^File:/,'')),thumbnail:thumb.href,source:source.href,artist:plain(meta.Artist?.value),license:plain(meta.LicenseShortName?.value),licenseUrl:/^https:\/\//.test(meta.LicenseUrl?.value||'')?meta.LicenseUrl.value:''}];
  }).slice(0,6);
}
export async function searchImages(query,{signal,fetcher=fetch}={}){
  const url=new URL('https://commons.wikimedia.org/w/api.php');
  const searchQuery=/^(mercury|venus|earth|mars|jupiter|saturn|uranus|neptune)$/i.test(query.trim())?`${query} planet`:query;
  url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:searchQuery,gsrnamespace:'6',gsrlimit:'10',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'640'});
  const response=await fetcher(url,{headers:{'User-Agent':'YogiLocal/1.0 (personal desktop assistant)'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Image search is temporarily unavailable. Please try again.');
  const data=await response.json();if(data.error)throw new Error('Image search could not process this query. Try a shorter subject.');
  return normalizeImages(data);
}
