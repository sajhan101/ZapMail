const fs = require('fs');
const path = require('path');

function createPdf(filePath) {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 260 >>
stream
BT
/F1 20 Tf
50 720 Td
(PhoneMail Enterprise Carrier Specification) Tj
/F1 12 Tf
0 -35 Td
(Official Telecom Carrier & SMS Gateway Interop Specification) Tj
0 -25 Td
(Version: 2.4 - Buildathon Verified Standard) Tj
0 -30 Td
(1. Architecture Overview: Phone-to-Email Gateway Protocol) Tj
0 -20 Td
(2. Dual SMS/SMTP Bridge: Automatic Carrier Inbound Alerts) Tj
0 -20 Td
(3. Multi-Tenant User Isolation & Encryption Standard) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000557 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
634
%%EOF`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(content, 'utf-8'));
  console.log('Created valid PDF at:', filePath, 'Size:', fs.statSync(filePath).size);
}

const root = path.resolve(__dirname, '..');
createPdf(path.join(root, 'backend', 'uploads', 'carrier_specification_doc.pdf'));
createPdf(path.join(root, 'frontend', 'public', 'carrier_specification_doc.pdf'));
