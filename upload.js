const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch'); // Node 18+ has fetch natively, wait, this is node 20+

async function upload() {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream('d:/Antigravity Proyectos/CarteleriaQ/articulos_importacion.csv'));

    const res = await fetch('http://localhost:3000/api/products/upload-csv', {
      method: 'POST',
      body: formData,
    });
    
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
upload();
