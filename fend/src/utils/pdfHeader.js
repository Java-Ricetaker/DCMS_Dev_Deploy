import logo from '../pages/logo.png';

/**
 * Adds clinic header with logo and name to PDF documents
 * @param {jsPDF} doc - The jsPDF document instance
 * @param {number} startY - The Y position to start the header (default: 20)
 * @returns {Promise<number>} - The Y position after the header for subsequent content
 */
export const addClinicHeader = async (doc, startY = 20) => {
  try {
    // Add logo to PDF (convert image to base64 and add)
    const logoBase64 = await convertImageToBase64(logo);
    
    // Calculate center position for logo and text
    const pageWidth = doc.internal.pageSize.getWidth();
    const logoSize = 40; // Logo size in pixels
    const logoX = (pageWidth - logoSize - 200) / 2; // Center logo, accounting for text width
    
    // Add logo image (40x40 pixels, centered)
    doc.addImage(logoBase64, 'PNG', logoX, startY, logoSize, logoSize);
    
    // Add clinic name next to logo (centered)
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60); // Dark gray color
    const textX = logoX + logoSize + 10; // Position text next to logo
    const textY = startY + (logoSize / 2) + 6; // Vertically center with logo
    doc.text('Kreative Dental & Orthodontics', textX, textY);
    
    // Add a subtle line under the header
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(20, startY + logoSize + 15, pageWidth - 20, startY + logoSize + 15);
    
    // Return the Y position after the header for subsequent content
    return startY + logoSize + 30;
  } catch (error) {
    console.error('Error adding clinic header to PDF:', error);
    // Fallback: just add text without logo (centered)
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    const textWidth = doc.getTextWidth('Kreative Dental & Orthodontics');
    doc.text('Kreative Dental & Orthodontics', (pageWidth - textWidth) / 2, startY + 20);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(20, startY + 40, pageWidth - 20, startY + 40);
    return startY + 50;
  }
};

/**
 * Converts an image file to base64 string
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Base64 encoded image string
 */
const convertImageToBase64 = (imagePath) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const base64 = canvas.toDataURL('image/png');
      resolve(base64);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imagePath;
  });
};
