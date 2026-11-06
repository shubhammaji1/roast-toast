import sharp from 'sharp';
const families=['landing','feed','detail','profile','publishing','roast-composer','coffee-checkout'];
const widths=[390,768,1280,1440];const composites=[];const cell=340;const height=285;
for(const [row,family] of families.entries())for(const [col,width]of widths.entries()){
 const label=Buffer.from(`<svg width="340" height="25"><rect width="340" height="25" fill="#25271f"/><text x="10" y="17" fill="white" font-family="Arial" font-size="12">${family} / ${width}px</text></svg>`);
 const input=await sharp(`.data/qa/${family}-${width}.png`).resize(cell,height-25,{fit:'cover',position:'top'}).png().toBuffer();
 composites.push({input:label,left:col*cell,top:row*height},{input,left:col*cell,top:row*height+25});
}
await sharp({create:{width:cell*4,height:height*families.length,channels:3,background:'#f7f5f0'}}).composite(composites).png().toFile('.data/qa/contact-sheet.png');
console.log('Saved .data/qa/contact-sheet.png');
