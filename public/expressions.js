// Shared poses for the existing LED and illustrated face rigs.
export const EXPRESSION_BASE = {eyeScale:1,squint:0,browL:0,browR:0,tiltL:0,tiltR:0,headRot:0,lookX:0,lookY:0,cheek:.5,width:1,open:0,smile:.55,winkL:0,winkR:0,happyEyes:0,heartEyes:0,starEyes:0,xEyes:0,shades:0,tear:0,smirk:0};
export const EXPRESSIONS = {
  cheerful:{label:'Cheerful grin',pose:{smile:.95,cheek:.9,squint:.22,browL:4,browR:4,width:1.12}},
  laughing:{label:'Laugh',pose:{smile:1,cheek:1,happyEyes:1,open:.48,width:1.16,browL:6,browR:6}},
  playful:{label:'Wink',pose:{smile:.85,cheek:.8,winkL:1,browL:3,browR:9,headRot:-5,width:.95}},
  surprised:{label:'Surprised',pose:{eyeScale:1.2,browL:16,browR:16,smile:0,width:.48,open:.58,cheek:.25}},
  curious:{label:'Curious',pose:{eyeScale:1.06,browL:13,browR:-1,tiltL:-9,tiltR:5,smile:.28,headRot:-7,lookX:.2,width:.8}},
  focused:{label:'Focused',pose:{squint:.65,browL:-7,browR:-7,tiltL:12,tiltR:-12,smile:.05,width:.66,lookY:.35,cheek:.25}},
  confused:{label:'Confused',pose:{browL:15,browR:-8,tiltL:-12,tiltR:12,smile:-.12,width:.58,headRot:8,lookX:-.45}},
  concerned:{label:'Concerned',pose:{browL:3,browR:3,tiltL:-18,tiltR:18,smile:-.55,width:.8,eyeScale:.96,cheek:.2,headRot:-3}},
  proud:{label:'Proud smile',pose:{smile:.85,squint:.4,browL:5,browR:5,cheek:.85,lookY:-.2,headRot:3,width:1.15}},
  sleepy:{label:'Sleepy',pose:{winkL:.72,winkR:.72,browL:-5,browR:-5,smile:.12,width:.65,headRot:8,lookY:.4,cheek:.3}},
  affectionate:{label:'Heart eyes',pose:{heartEyes:1,smile:.95,cheek:1,browL:8,browR:8,width:1.1}},
  relieved:{label:'Relieved smile',pose:{happyEyes:1,smile:.7,cheek:.75,browL:2,browR:2,width:.92}},
  excited:{label:'Star-struck',pose:{starEyes:1,smile:1,open:.38,width:1.18,browL:10,browR:10,cheek:1}},
  dizzy:{label:'Dizzy',pose:{xEyes:1,smile:-.08,open:.22,width:.72,headRot:9,browL:6,browR:-3}},
  cool:{label:'Cool shades',pose:{shades:1,smirk:.7,smile:.45,width:.92,browL:2,browR:7,headRot:-3}},
  sad:{label:'Sad',pose:{tear:1,smile:-.7,tiltL:-16,tiltR:16,browL:4,browR:4,lookY:.45,eyeScale:.94,cheek:.2,width:.75}},
  grumpy:{label:'Grumpy',pose:{browL:-10,browR:-10,tiltL:18,tiltR:-18,smile:-.38,width:.62,squint:.35,cheek:.2}},
  shy:{label:'Shy',pose:{cheek:1,lookX:-.55,lookY:.5,smile:.42,width:.7,headRot:-6,squint:.25,browL:4,browR:4}},
  mischievous:{label:'Mischievous',pose:{smirk:.9,squint:.45,browL:-4,browR:12,smile:.55,lookX:.45,width:.9}},
  pondering:{label:'Hmm…',pose:{browL:14,browR:-4,lookX:-.5,lookY:-.7,smirk:.5,smile:.08,width:.6,headRot:4}},
};
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);
