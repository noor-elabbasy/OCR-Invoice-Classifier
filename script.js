

function showSection(id) {
    document.querySelectorAll('.section').forEach(section => {
      section.style.display = 'none';
    });
  
    document.getElementById(id).style.display = 'block';
  
    if (id === 'grouped') displayGroupedPage();
    if (id === 'charts') renderCharts();
    if (id === 'summary') updateSummary();
    if (id === 'invoices') listInvoices();
  }
  
  
  const normalizeTerm = term => {
    const clean = term.replace(/\s+/g, "").toLowerCase();
    if (clean === "net15") return "Net 15";
    if (clean === "net30") return "Net 30";
    if (clean === "net45") return "Net 45";
    if (clean === "dueonreceipt") return "Due on Receipt";
    if (clean === "eom") return "End of Month";
    if (clean === "cod") return "COD";
    return "Unknown";
  };
  
  const uploadForm = document.getElementById("uploadForm");
  const uploadResult = document.getElementById("uploadResult");
  
  if (uploadForm) {
    uploadForm.addEventListener("submit", function (e) {
      e.preventDefault();
  
      const fileInput = document.getElementById("invoiceFile");
      const file = fileInput.files[0];
  
      if (!file) {
        alert("Please select an invoice file.");
        return;
      }
  
      const reader = new FileReader();
  
      reader.onload = function () {
        const fileURL = reader.result;  // ADD THIS
        uploadResult.innerHTML = "<p>⏳ Extracting invoice data, please wait...</p>";


        Tesseract.recognize(
          reader.result,
          'eng',
          { logger: m => console.log("Tesseract Progress:", JSON.stringify(m)) }
        ).then(({ data: { text } }) => {
          console.log("Extracted Text:", text);
  
          // Extract payment term
          let term = "Unknown";
          const termMatch = text.match(/(Net\s?\d{1,3})|(Due\s?on\s?Receipt)|(End\s?of\s?Month)|\bCOD\b|\bPIA\b/i);
          if (termMatch) {
            term = termMatch[0].trim();
          }
         // Prepare cleaned lines for analysis
const lines = text.split("\n").map(l => l.trim().toLowerCase());
const cleanedLines = lines.map(l =>
  l.replace(/[oO]/g, "0")
   .replace(/[lI]/g, "1")
   .replace(/[^\x00-\x7F]/g, "") // remove weird unicode chars
);

let amount = "N/A";
const amountKeywords = ["total", "amount due", "balance", "total due", "grand total", "pay this amount"];
let totalMatch = null;

// STEP 1: Find lines with amount-related keywords (bottom-up)
for (let line of cleanedLines.slice().reverse()) {
  for (let keyword of amountKeywords) {
    if (line.includes(keyword)) {
      const match = line.match(/[\$€£]?\s*\d{1,3}(?:[.,]?\d{3})*[.,]?\d{2}/);
      if (match) {
        totalMatch = match[0];
        break;
      }
    }
  }
  if (totalMatch) break;
}

// STEP 2: Normalize and parse total
function parseAmount(rawValue) {
  let raw = rawValue.replace(/[^0-9.,]/g, '');

  // Normalize based on separator position
  if (raw.includes(',') && raw.includes('.')) {
    if (raw.lastIndexOf('.') > raw.lastIndexOf(',')) {
      raw = raw.replace(/,/g, '');
    } else {
      raw = raw.replace(/\./g, '').replace(',', '.');
    }
  } else if (raw.includes(',')) {
    const commaCount = (raw.match(/,/g) || []).length;
    if (commaCount > 1) {
      raw = raw.replace(/,/g, '');
    } else {
      raw = raw.replace(',', '.');
    }
  }

  // Fix if it's a long integer with missing dot (e.g. 264600 becomes 2646.00)
  if (!raw.includes('.') && raw.length >= 5) {
    raw = raw.slice(0, -2) + '.' + raw.slice(-2);
  }

  const num = parseFloat(raw);
  return isNaN(num) ? null : num.toFixed(2);
}

if (totalMatch) {
  const parsed = parseAmount(totalMatch);
  if (parsed) amount = parsed;
} else {
  // Fallback: try all amount-like numbers in the document
  const allAmounts = [];

  for (let line of cleanedLines) {
    const matches = line.match(/[\$€£]?\s*\d{1,3}(?:[.,]?\d{3})*[.,]?\d{2}/g);
    if (matches) {
      matches.forEach(val => {
        const parsed = parseAmount(val);
        if (parsed) allAmounts.push(parseFloat(parsed));
      });
    }
  }

  if (allAmounts.length > 0) {
    amount = Math.max(...allAmounts).toFixed(2);
  }
}

         // Extract invoice date with support for multiple formats
         let invoiceDate = "N/A";
         const datePatterns = [
           /\b\d{2}\/\d{2}\/\d{4}\b/, // dd/mm/yyyy or mm/dd/yyyy
           /\b\d{4}-\d{2}-\d{2}\b/,   // yyyy-mm-dd
           /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/ // flexible format
         ];
         
         for (let pattern of datePatterns) {
           const match = text.match(pattern);
           if (match) {
             const rawDate = match[0];
             const parts = rawDate.includes("-") ? rawDate.split("-") :
                           rawDate.includes("/") ? rawDate.split("/") :
                           rawDate.split(".");
         
             if (parts[0].length === 4) {
               // yyyy-mm-dd
               invoiceDate = rawDate;
             } else if (parseInt(parts[0]) > 12) {
               // dd/mm/yyyy
               invoiceDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
             } else {
               // mm/dd/yyyy
               invoiceDate = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
             }
             break;
           }
         }
         

         let vendor = "Unknown Vendor";

         // 1. Look for specific keywords first
         for (let i = 0; i < lines.length; i++) {
           const lower = lines[i].toLowerCase();
           if (lower.includes("company") || lower.includes("from") || lower.includes("seller")) {
             vendor = lines[i + 1]?.trim() || "Unknown Vendor";
             break;
           }
         }
         
         // 2. Look in the first 7 lines for strong candidate (all caps or includes "TECH", etc.)
         if (vendor === "Unknown Vendor") {
           for (let i = 0; i < Math.min(7, lines.length); i++) {
             const line = lines[i].trim();
         
             // Skip contact/address-like lines
             if (/\d{2,}/.test(line) || /@/.test(line)) continue;
         
             // Strong match for business name: ALL CAPS or includes TECH, SOLUTIONS, etc.
             if (
               /^[A-Z\s&.,\-]+$/.test(line) &&
               (line.includes("TECH") || line.length > 5)
             ) {
               vendor = line;
               break;
             }
           }
         }
         
         // 3. Business keywords fallback (LLC, Inc, Corp...)
         if (vendor === "Unknown Vendor") {
           for (let line of lines) {
             if (/\b(llc|inc|corp|ltd|solutions|technologies|services|systems|group|partners)\b/i.test(line)) {
               vendor = line.trim();
               break;
             }
           }
         }
         
         // 4. Final fallback: first capitalized line before Invoice
         if (vendor === "Unknown Vendor") {
           for (let line of lines) {
             if (/invoice|bill/i.test(line)) break;
             if (line.length > 2 && /^[A-Z]/.test(line)) {
               vendor = line.trim();
               break;
             }
           }
         }
         
  
          // Due date logic
          let parsedDate = null;
          if (invoiceDate !== "N/A") {
            const [day, month, year] = invoiceDate.split("/");
            parsedDate = new Date(`${year}-${month}-${day}`);
          }
  
          let termDays = 0;
          const cleanTerm = term.replace(/\s+/g, "").toLowerCase();
          if (cleanTerm === "net15") termDays = 15;
          else if (cleanTerm === "net30") termDays = 30;
          else if (cleanTerm === "net45") termDays = 45;
          else if (cleanTerm === "eom") termDays = 0;
          else if (cleanTerm === "cod" || cleanTerm === "dueonreceipt") termDays = 0;
  
          let dueDate = "N/A";
if (parsedDate) {
  if (cleanTerm === "eom") {
    const endOfMonth = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1, 0);
    dueDate = endOfMonth.toISOString().split("T")[0];
  } else {
    const calculatedDue = new Date(parsedDate);
    calculatedDue.setDate(calculatedDue.getDate() + termDays);
    dueDate = calculatedDue.toISOString().split("T")[0];
  }
}

let isOverdue = false;
if (dueDate !== "N/A") {
  const graceDueDate = new Date(dueDate);
  graceDueDate.setDate(graceDueDate.getDate() + 1); // 1-day grace period
  const today = new Date();
  isOverdue = graceDueDate < today;
}

let invoiceId = "Unknown";
const invoiceIdMatch = text.match(/invoice\s*(number|no|#)?[:\s]*([A-Za-z0-9\-]+)/i);
if (invoiceIdMatch) {
  invoiceId = invoiceIdMatch[2].trim();
}

          

const invoice = {
    id: invoiceId,  // <-- now uses the extracted invoice number
    vendor: vendor,
    date: invoiceDate,
    amount: amount,
    term: term,
    dueDate: dueDate,
    isOverdue: isOverdue,
    fileURL: fileURL,
  };
  
          
          
          
  
          invoices.push(invoice);
  
          uploadResult.innerHTML = `
            <p><strong>Vendor:</strong> ${vendor}</p>
            <p><strong>Date:</strong> ${invoiceDate}</p>
            <p><strong>Amount:</strong> ${amount}</p>
            <p><strong>Payment Term:</strong> ${term}</p>
            <p><strong>Due Date:</strong> ${dueDate}</p>
            <p><strong>Status:</strong> ${isOverdue ? "⚠️ Overdue" : "✓ On Time"}</p>
            
          `;
  
          updateSummary();
          listInvoices();
        });
      };
  
      reader.readAsDataURL(file);
    });
  }
  
  function updateSummary() {
    let paidTotal = 0;
    let overdueTotal = 0;
  
    invoices.forEach(i => {
      const amount = parseFloat(i.amount) || 0;
      if (i.isOverdue) {
        overdueTotal += amount;
      } else {
        paidTotal += amount;
      }
    });
  
    document.getElementById("paidAmount").textContent = "$" + paidTotal.toFixed(2);
    document.getElementById("overdueAmount").textContent = "$" + overdueTotal.toFixed(2);
  }
  
  function listInvoices() {
    const tableBody = document.getElementById("invoiceTableBody");
    tableBody.innerHTML = "";
  
    invoices.forEach((i, index) => {
      const row = document.createElement("tr");
      if (i.isOverdue) {
        row.style.backgroundColor = "#ffe0e0";
      }
      row.innerHTML = `
      <td contenteditable="true" onblur="editInvoice(${index}, 'id', this.innerText)">${i.id}</td>
      <td contenteditable="true" onblur="editInvoice(${index}, 'vendor', this.innerText)">${i.vendor}</td>
      <td contenteditable="true" onblur="editInvoice(${index}, 'date', this.innerText)">${i.date}</td>
      <td contenteditable="true" onblur="editInvoice(${index}, 'amount', this.innerText)">${i.amount}</td>
      <td contenteditable="true" onblur="editInvoice(${index}, 'term', this.innerText)">${i.term}</td>
      <td contenteditable="false">${i.dueDate}</td>
      <td contenteditable="false">${i.isOverdue ? "⚠️ Overdue" : "✓ On Time"}</td>
      <td>${i.tags ? i.tags.join(", ") : ""}</td>
      <td>
        <button onclick="viewInvoice(${index})">View</button>
        <button onclick="deleteInvoice(${index})">Delete</button>
      </td>
    `;
    

    
      tableBody.appendChild(row);
    });
  }
  function editInvoice(index, field, value) {
    if (!invoices[index]) return;
  
    // Update the value
    invoices[index][field] = value.trim();
  
    // Recalculate if amount, date, or term changed
    if (["amount", "date", "term"].includes(field)) {
      const parsedDate = new Date(invoices[index].date);
      let termDays = 0;
      const cleanTerm = normalizeTerm(invoices[index].term || "").toLowerCase();
      if (cleanTerm === "net15") termDays = 15;
      else if (cleanTerm === "net30") termDays = 30;
      else if (cleanTerm === "net45") termDays = 45;
      else if (cleanTerm === "eom") termDays = 0;
      else if (cleanTerm === "cod" || cleanTerm === "dueonreceipt") termDays = 0;
  
      if (!isNaN(parsedDate.getTime())) {
        if (cleanTerm === "eom") {
          const endOfMonth = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1, 0);
          invoices[index].dueDate = endOfMonth.toISOString().split("T")[0];
        } else {
          const due = new Date(parsedDate);
          due.setDate(due.getDate() + termDays);
          invoices[index].dueDate = due.toISOString().split("T")[0];
        }
  
        const grace = new Date(invoices[index].dueDate);
        grace.setDate(grace.getDate() + 1);
        invoices[index].isOverdue = grace < new Date();
      }
    }
  
    updateSummary();
    listInvoices(); // Refresh table with updated data
  }
  
  function viewInvoice(index) {
    const invoice = invoices[index];
    const container = document.getElementById("fileViewerContainer");
  
    if (invoice && invoice.fileURL) {
      container.innerHTML = ""; // clear previous
  
      if (invoice.fileURL.endsWith(".pdf")) {
        container.innerHTML = `<iframe src="${invoice.fileURL}" style="width:100%; height:100%;" frameborder="0"></iframe>`;
      } else if (invoice.fileURL.match(/\.(png|jpg|jpeg|gif)$/i)) {
        container.innerHTML = `<img src="${invoice.fileURL}" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
      } else {
        container.innerHTML = `<p>⚠️ Unsupported file format</p>`;
      }
  
      document.getElementById("fileModal").style.display = "block";
    } else {
      alert("No file available for this invoice.");
    }
  }
  
  function closeFileModal() {
    document.getElementById("fileModal").style.display = "none";
    document.getElementById("fileViewerContainer").innerHTML = "";
  }
  
  
  
  function deleteInvoice(id) {
    const index = invoices.findIndex(inv => inv.id === id);
    if (index !== -1) {
      invoices.splice(index, 1);
      listInvoices(); // Refresh the table
    }
  }
  
  
 
  
  // New function to delete an invoice
  function deleteInvoice(index) {
    if (confirm("Are you sure you want to delete this invoice?")) {
      invoices.splice(index, 1);  // remove from array
      listInvoices();             // re-render table
      updateSummary();            // optional: refresh summary
    }
  }
  
  
  function displayGroupedPage() {
    const container = document.getElementById("groupedByTermContainer");
    container.innerHTML = "";
  
    const groups = {};
  
    invoices.forEach(inv => {
      const term = normalizeTerm(inv.term || "Unknown");
      if (!groups[term]) groups[term] = [];
      groups[term].push(inv);
    });
  
    for (const term in groups) {
      const section = document.createElement("div");
      section.style.marginBottom = "20px";
      section.innerHTML = `
        <h3>${term}</h3>
        <ul>
          ${groups[term]
            .map(inv => `<li>${inv.id} - ${inv.vendor} - ${inv.amount}</li>`)
            .join("")}
        </ul>
      `;
      container.appendChild(section);
    }
  }
  
  function searchInvoices() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const tableBody = document.getElementById("invoiceTableBody");
    tableBody.innerHTML = "";
  
    invoices.forEach(i => {
      const rowText = `${i.id} ${i.vendor} ${i.date} ${i.amount} ${i.term} ${i.dueDate} ${i.isOverdue ? "overdue" : "ontime"}`.toLowerCase();
      if (rowText.includes(query)) {
        const row = document.createElement("tr");
        if (i.isOverdue) {
          row.style.backgroundColor = "#ffe0e0";
        }
        row.innerHTML = `
          <td>${i.id}</td>
          <td>${i.vendor}</td>
          <td>${i.date}</td>
          <td>${i.amount}</td>
          <td>${i.term}</td>
          <td>${i.dueDate}</td>
          <td>${i.isOverdue ? "⚠️ Overdue" : "✓ On Time"}</td>
        `;
        tableBody.appendChild(row);
      }
    });
  }
  
  // ✅ Export to Excel using SheetJS
  function exportToExcel() {
    const headers = ["Invoice ID", "Vendor", "Date", "Amount", "Payment Term", "Due Date", "Status"];
    const rows = invoices.map(i => [
      i.id,
      i.vendor,
      i.date,
      i.amount,
      i.term,
      i.dueDate,
      i.isOverdue ? "Overdue" : "On Time"
    ]);
  
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");
  
    XLSX.writeFile(workbook, "Invoices.xlsx");
  } 
  let pieChartInstance = null;
  let barChartInstance = null;
  
  function renderCharts() {
    // Destroy previous charts if they exist
    if (pieChartInstance) {
      pieChartInstance.destroy();
    }
    if (barChartInstance) {
      barChartInstance.destroy();
    }
  
    // Prepare data
    const termCounts = {}; // For Pie Chart
    const amountByTerm = {}; // For new Bar Chart
  
    invoices.forEach(inv => {
      const term = normalizeTerm(inv.term || "Unknown");
      const amount = parseFloat(inv.amount) || 0;
  
      // Count invoices for Pie Chart
      termCounts[term] = (termCounts[term] || 0) + 1;
  
      // Sum amounts for Bar Chart
      amountByTerm[term] = (amountByTerm[term] || 0) + amount;
    });
  
    // Pie Chart - Invoices by Payment Term
    const pieCtx = document.getElementById('termChart').getContext('2d');
    pieChartInstance = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(termCounts),
        datasets: [{
          data: Object.values(termCounts),
          backgroundColor: ['#4caf50', '#2196f3', '#ff9800', '#f44336', '#9c27b0', '#00bcd4']
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Invoices by Payment Term'
          }
        }
      }
    });
  
    // Bar Chart - Total Amount by Payment Term
    const barCtx = document.getElementById('amountChart').getContext('2d');
    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(amountByTerm),
        datasets: [{
          label: 'Total Amount',
          data: Object.values(amountByTerm),
          backgroundColor: '#3f51b5'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Total Amount by Payment Term'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
   // 📣 Load invoices immediately when page loads
listInvoices();
updateSummary();

  