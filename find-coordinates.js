const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs').promises;

async function createCoordinateHelper() {
    try {
        // Load the PDF
        const pdfBytes = await fs.readFile('DDA_FORM.pdf');
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // Get the first page
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();

        console.log(`\n📐 PDF Page Dimensions:`);
        console.log(`Width: ${width} points`);
        console.log(`Height: ${height} points\n`);

        // Embed font
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Draw a grid to help find coordinates
        // Draw vertical lines every 50 points
        for (let x = 0; x <= width; x += 50) {
            firstPage.drawLine({
                start: { x, y: 0 },
                end: { x, y: height },
                thickness: 0.5,
                color: rgb(0.8, 0.8, 0.8),
            });

            // Label every 100 points
            if (x % 100 === 0) {
                firstPage.drawText(`${x}`, {
                    x: x + 2,
                    y: 10,
                    size: 8,
                    font,
                    color: rgb(1, 0, 0),
                });
            }
        }

        // Draw horizontal lines every 50 points
        for (let y = 0; y <= height; y += 50) {
            firstPage.drawLine({
                start: { x: 0, y },
                end: { x: width, y },
                thickness: 0.5,
                color: rgb(0.8, 0.8, 0.8),
            });

            // Label every 100 points
            if (y % 100 === 0) {
                firstPage.drawText(`${y}`, {
                    x: 10,
                    y: y + 2,
                    size: 8,
                    font,
                    color: rgb(1, 0, 0),
                });
            }
        }

        // Add sample text at test positions
        const testPositions = [
            { x: 150, y: 650, label: 'Name (150, 650)' },
            { x: 150, y: 600, label: 'IBAN (150, 600)' },
            { x: 150, y: 550, label: 'Bank (150, 550)' },
            { x: 150, y: 500, label: 'Amount (150, 500)' },
            { x: 150, y: 450, label: 'Date (150, 450)' },
        ];

        testPositions.forEach(pos => {
            firstPage.drawText(pos.label, {
                x: pos.x,
                y: pos.y,
                size: 10,
                font,
                color: rgb(0, 0, 1),
            });

            // Draw a small circle at the position
            firstPage.drawCircle({
                x: pos.x,
                y: pos.y,
                size: 3,
                color: rgb(1, 0, 0),
            });
        });

        // Save the helper PDF
        const helperPdfBytes = await pdfDoc.save();
        await fs.writeFile('DDA_FORM_WITH_GRID.pdf', helperPdfBytes);

        console.log('✅ Created DDA_FORM_WITH_GRID.pdf');
        console.log('\nThis PDF has:');
        console.log('- A grid overlay (every 50 points)');
        console.log('- Red coordinate labels (every 100 points)');
        console.log('- Blue sample text at test positions');
        console.log('- Red dots showing exact text positions\n');
        console.log('Open this file to see where the text will appear.');
        console.log('Adjust the coordinates in server.js based on your form layout.\n');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

createCoordinateHelper();
