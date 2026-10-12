// New optional theme uploads only. Existing merchant photos are never replaced.
export async function prepareAuraPhoto(file) {
  if(!["image/png","image/jpeg","image/webp","image/avif"].includes(file.type))throw new Error("Choose a PNG, JPEG, WebP or AVIF photo.");
  if(file.size>10*1024*1024)throw new Error("Choose a photo no larger than 10 MB.");
  let bitmap;
  try{bitmap=await createImageBitmap(file);}
  catch{throw new Error("This photo could not be opened. Choose a valid image.");}
  try{
    if(bitmap.width*bitmap.height>40000000)throw new Error("Choose a photo no larger than 40 megapixels.");
    const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.9));
    if(!blob||blob.type!=="image/webp")throw new Error("This browser cannot prepare WebP photos. Try a current browser.");
    return new File([blob],`${file.name.replace(/\.[^/.]+$/,"")}.webp`,{type:"image/webp"});
  }finally{bitmap.close();}
}
