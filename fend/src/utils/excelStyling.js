/**
 * Excel styling utility functions for consistent formatting across all exports
 */

/**
 * Applies header styling to a row
 * @param {ExcelJS.Row} row - The Excel row to style
 * @param {Object} options - Styling options
 */
export const styleHeaderRow = (row, options = {}) => {
  const {
    fillColor = { argb: 'FF0077B6' }, // Brand blue
    fontColor = { argb: 'FFFFFFFF' }, // White
    fontSize = 12,
    bold = true,
    alignment = { horizontal: 'center', vertical: 'middle' }
  } = options;

  row.font = {
    bold,
    size: fontSize,
    color: fontColor
  };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: fillColor
  };
  row.alignment = alignment;
  row.height = 25;

  // Add borders
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0056B3' } },
      bottom: { style: 'thin', color: { argb: 'FF0056B3' } },
      left: { style: 'thin', color: { argb: 'FF0056B3' } },
      right: { style: 'thin', color: { argb: 'FF0056B3' } }
    };
  });
};

/**
 * Applies data row styling with alternating colors
 * @param {ExcelJS.Row} row - The Excel row to style
 * @param {number} rowIndex - The row index (0-based)
 * @param {Object} options - Styling options
 */
export const styleDataRow = (row, rowIndex, options = {}) => {
  const {
    evenRowColor = { argb: 'FFF8F9FA' }, // Light gray
    oddRowColor = { argb: 'FFFFFFFF' }, // White
    fontColor = { argb: 'FF333333' }, // Dark gray
    fontSize = 11
  } = options;

  const isEven = rowIndex % 2 === 0;
  const fillColor = isEven ? evenRowColor : oddRowColor;

  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: fillColor
  };
  row.font = {
    size: fontSize,
    color: fontColor
  };
  row.alignment = { vertical: 'middle' };
  row.height = 20;

  // Add borders
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };
  });
};

/**
 * Adds a header section with clinic name to a worksheet
 * @param {ExcelJS.Worksheet} worksheet - The worksheet to add header to
 * @param {string} title - The report title
 * @param {string} subtitle - Optional subtitle
 * @returns {number} The row index after the header
 */
export const addWorksheetHeader = (worksheet, title, subtitle = null) => {
  // Clinic name row
  const clinicRow = worksheet.addRow(['Kreative Dental & Orthodontics']);
  clinicRow.getCell(1).font = {
    bold: true,
    size: 16,
    color: { argb: 'FF3C3C3C' }
  };
  clinicRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  clinicRow.height = 30;

  // Title row
  const titleRow = worksheet.addRow([title]);
  titleRow.getCell(1).font = {
    bold: true,
    size: 14,
    color: { argb: 'FF0077B6' } // Brand blue
  };
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  titleRow.height = 25;

  // Subtitle row (if provided)
  if (subtitle) {
    const subtitleRow = worksheet.addRow([subtitle]);
    subtitleRow.getCell(1).font = {
      size: 11,
      color: { argb: 'FF666666' }
    };
    subtitleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    subtitleRow.height = 20;
  }

  // Empty row for spacing
  worksheet.addRow([]);

  return subtitle ? 4 : 3;
};

/**
 * Styles a specific cell with custom formatting
 * @param {ExcelJS.Cell} cell - The cell to style
 * @param {Object} options - Styling options
 */
export const styleCell = (cell, options = {}) => {
  const {
    fillColor,
    fontColor = { argb: 'FF333333' },
    fontSize = 11,
    bold = false,
    alignment = { horizontal: 'left', vertical: 'middle' },
    numFmt
  } = options;

  if (fillColor) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: fillColor
    };
  }

  cell.font = {
    bold,
    size: fontSize,
    color: fontColor
  };

  cell.alignment = alignment;

  if (numFmt) {
    cell.numFmt = numFmt;
  }
};

/**
 * Applies currency formatting to a cell
 * @param {ExcelJS.Cell} cell - The cell to format
 * @param {string} currencySymbol - Currency symbol (default: ₱)
 */
export const formatCurrency = (cell, currencySymbol = '₱') => {
  cell.numFmt = `"${currencySymbol}"#,##0.00`;
  cell.font = {
    size: 11,
    color: { argb: 'FF28A745' } // Green for currency
  };
};

/**
 * Applies percentage formatting to a cell
 * @param {ExcelJS.Cell} cell - The cell to format
 */
export const formatPercentage = (cell) => {
  cell.numFmt = '0.00%';
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
};

/**
 * Styles a total/summary row
 * @param {ExcelJS.Row} row - The row to style
 */
export const styleTotalRow = (row) => {
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE3F2FD' } // Light blue
  };
  row.font = {
    bold: true,
    size: 12,
    color: { argb: 'FF0077B6' } // Brand blue
  };
  row.height = 25;

  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0077B6' } },
      bottom: { style: 'medium', color: { argb: 'FF0077B6' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };
  });
};

