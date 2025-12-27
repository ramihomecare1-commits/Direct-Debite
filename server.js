const express = require('express');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// GET / - Serve the form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /fill - Generate filled PDF
app.post('/fill', async (req, res) => {
    try {
        // Validate input
        const { name, iban, bankName, amount } = req.body;

        if (!name || !iban || !bankName || !amount) {
            return res.status(400).json({
                error: 'All fields are required: name, iban, bankName, amount'
            });
        }

        // Validate IBAN format (basic check)
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban.replace(/\s/g, ''))) {
            return res.status(400).json({
                error: 'Invalid IBAN format'
            });
        }

        // Validate amount
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({
                error: 'Amount must be a positive number'
            });
        }

        // Load the PDF template
        const templatePath = path.join(__dirname, 'DDA_FORM.pdf');

        // Check if template exists
        try {
            await fs.access(templatePath);
        } catch (error) {
            return res.status(500).json({
                error: 'PDF template not found. Please contact administrator.'
            });
        }

        const existingPdfBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Get the form from the PDF
        const form = pdfDoc.getForm();

        // Get current date
        const currentDate = new Date().toLocaleDateString('en-GB');

        // Fill the form fields
        // Note: Field names need to be verified with actual PDF template
        try {
            // Common DDA form field names (adjust based on actual PDF)
            const nameField = form.getTextField('accountHolderName') || form.getTextField('name') || form.getTextField('fullName');
            const ibanField = form.getTextField('iban') || form.getTextField('accountNumber');
            const bankField = form.getTextField('bankName') || form.getTextField('bank');
            const amountField = form.getTextField('amount') || form.getTextField('fixedAmount');

            if (nameField) nameField.setText(name);
            if (ibanField) ibanField.setText(iban);
            if (bankField) bankField.setText(bankName);
            if (amountField) amountField.setText(amount.toString());

            // Try to fill date field if exists
            try {
                const dateField = form.getTextField('date') || form.getTextField('signatureDate');
                if (dateField) dateField.setText(currentDate);
            } catch (e) {
                // Date field might not exist, continue
            }

            // Flatten the form to make it non-editable (optional)
            // form.flatten();

        } catch (error) {
            console.error('Error filling form fields:', error);
            return res.status(500).json({
                error: 'Error mapping form fields. PDF template may need field name verification.'
            });
        }

        // Save the filled PDF
        const pdfBytes = await pdfDoc.save();

        // Send the PDF as a download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="DDA_${name.replace(/\s/g, '_')}_${Date.now()}.pdf"`);
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({
            error: 'Failed to generate PDF. Please try again.'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the service`);
});
