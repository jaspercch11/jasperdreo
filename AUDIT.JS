/* ============================================
   >>> LOAD AUDITS AND UPDATE DASHBOARD <<<
   ============================================ */
  async function loadAudits() {
    try {
      const res = await fetch("http://localhost:3000/audits");
      const audits = await res.json();

      const tbody = document.querySelector("tbody");
      tbody.innerHTML = "";

      const today = new Date();
      const currentYear = today.getFullYear();

      // Count only audits with audit_date in current year
      let totalAudits = audits.filter(audit => {
        if (!audit.audit_date) return false;
        const auditYear = new Date(audit.audit_date).getFullYear();
        return auditYear === currentYear;
      }).length;

      let upcomingAudits = 0;
      let openFindings = 0;
      let highRiskIssues = 0;

      audits.forEach(audit => {
        const status = (audit.status || "").toLowerCase().trim();

        // Build Table Row
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${audit.audit_name || "N/A"}</td>
          <td>${audit.dept_audited || "N/A"}</td>
          <td>${audit.auditor || "N/A"}</td>
          <td>${audit.audit_date ? new Date(audit.audit_date).toLocaleDateString() : "N/A"}</td>
          <td><span class="badge ${getStatusColor(status)}">${formatStatus(status)}</span></td>
          <td class="table-actions">
            <button class="btn view">View</button>
            <button class="btn edit">Edit</button>
          </td>
        `;
        tbody.appendChild(row);

        // Metrics Calculation
        if (audit.audit_date && new Date(audit.audit_date) > today) {
          upcomingAudits++;
        }
        if (status === "completed") {
          openFindings++;
        }
        if (status === "pending") {
          highRiskIssues++;
        }
        if (status === "in progress") {
          upcomingAudits++;
        }
      });

      // Update Dashboard Widgets
      document.getElementById("totalAudits").textContent = totalAudits;
      document.getElementById("upcomingAudits").textContent = upcomingAudits;
      document.getElementById("openFindings").textContent = openFindings;
      document.getElementById("highRiskIssues").textContent = highRiskIssues;

    } catch (err) {
      console.error("Error fetching audits:", err);
    }
  }


/* ============================================
   >>> STATUS COLOR AND LABEL FORMATTERS <<<
   ============================================ */
function getStatusColor(statusRaw) {
  const status = (statusRaw || "").toLowerCase().trim();
  if (status === "completed") return "green";
  if (status === "scheduled") return "yellow";
  if (status === "pending") return "red";
  if (status === "in progress") return "manta";
  return "";
}

function formatStatus(statusRaw) {
  const status = (statusRaw || "").toLowerCase().trim();
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ============================================
   >>> LOAD PIE CHART OF AUDIT STATUS SUMMARY <<<
   ============================================ */
async function loadChart() {
  try {
    const res = await fetch("http://localhost:3000/audit-status-summary");
    const data = await res.json();

    // ==== Normalize and Group Statuses ====
    const statusCounts = {};
    data.forEach(({ status, count }) => {
      const normalized = (status || "").toLowerCase().trim();
      statusCounts[normalized] = (statusCounts[normalized] || 0) + parseInt(count);
    });

    const labels = Object.keys(statusCounts).map(s => formatStatus(s));
    const counts = Object.values(statusCounts);

    // ==== Chart Colors Mapping ====
    const colorMap = {
      "completed": "#33cc33",
      "scheduled": "#fdd835",
      "in progress": "#253f49ff",
      "pending": "#F44336"
    };

    const backgroundColor = Object.keys(statusCounts).map(status => colorMap[status] || "#ccc");

    // ==== Create Pie Chart ====
    const ctx = document.getElementById("auditStatusChart").getContext("2d");
    new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: backgroundColor
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top"
          }
        }
      }
    });
  } catch (err) {
    console.error("Error loading chart:", err);
  }
}

/* ============================================
   >>> FORM SUBMISSION HANDLER <<<
   ============================================ */
document.getElementById('auditForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  // ==== Collect Form Data ====
  const auditData = {
    audit_id: this.auditId.value.trim(),
    audit_name: this.auditName.value.trim(),
    dept_audited: this.department.value,
    auditor: this.auditor.value.trim(),
    audit_date: this.auditDate.value,
    status: this.status.value.trim().toLowerCase(), // normalized to lowercase for case-insensitive
  };

  try {
    const response = await fetch('http://localhost:3000/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditData),
    });

    const result = await response.json();

    if (result.success) {
      alert('✅ Audit added successfully!');
      this.reset();
      closeFloatingTab();

      // ==== Reload page to show new entry ====
      setTimeout(() => {
        window.location.href = 'audit.html';
      }, 1000);
    } else {
      alert('❌ Failed to add audit: ' + (result.message || 'Unknown error'));
    }
  } catch (err) {
    alert('⚠️ Error submitting audit: ' + err.message);
  }
});

/* ============================================
   >>> INITIAL LOAD ON PAGE READY <<<
   ============================================ */
loadAudits();
loadChart();
