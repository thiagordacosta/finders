const initialFinderNames = [
  "Fernando Castro",
  "Silas Pedro",
  "Sergio Parolo",
  "Tiago Alves",
  "Leo Lemes",
  "WLADEMIR HENRIQUE",
  "Carlos Jordaky",
  "Fred Almeida",
  "Alexandre Gabriel Mori",
  "Gustavo Bolsi",
  "GABRIEL FERRAZ",
  "Marino (Workng capital)",
  "Jean Garellha",
  "Luciano",
  "Gilli Basile Advogados",
  "Gerson - Cintia"
];

const SIGNED_CUTOFF_DATE = "01/04/2026";

const defaultFinderData = initialFinderNames.map((name) => ({
  id: slugify(name),
  name,
  sentMinute: false,
  signedAt: "",
  firstReferral: false,
  createdAt: new Date().toISOString(),
  leads: []
}));

const finderData = [];

let selectedFinderId = null;
let lastDeletedFinder = null;
let undoToastTimeoutId = null;

const finderForm = document.getElementById("finder-form");
const finderNameInput = document.getElementById("finder-name");
const sentMinuteInput = document.getElementById("sent-minute");
const firstReferralInput = document.getElementById("first-referral");
const finderGrid = document.getElementById("finder-grid");
const leadCount = document.getElementById("lead-count");
const totalLeads = document.getElementById("total-leads");
const gaugeProgress = document.getElementById("gauge-progress");
const tickMidLeft = document.getElementById("tick-mid-left");
const tickMidRight = document.getElementById("tick-mid-right");
const tickMax = document.getElementById("tick-max");
const eligibilityStatus = document.getElementById("eligibility-status");
const undoToast = document.getElementById("undo-toast");
const undoToastText = document.getElementById("undo-toast-text");
const undoButton = document.getElementById("undo-button");
const undoCloseButton = document.getElementById("undo-close-button");

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFinders(data) {
  if (!Array.isArray(data)) {
    return [...defaultFinderData];
  }

  return data.map((finder) => ({
    id: typeof finder.id === "string" && finder.id ? finder.id : `${slugify(finder.name ?? "finder")}-${Date.now()}`,
    name: typeof finder.name === "string" ? finder.name : "Finder",
    sentMinute: Boolean(finder.sentMinute),
    signedAt: typeof finder.signedAt === "string" ? finder.signedAt : "",
    firstReferral: Boolean(finder.firstReferral),
    createdAt: typeof finder.createdAt === "string" && finder.createdAt ? finder.createdAt : new Date().toISOString(),
    leads: Array.isArray(finder.leads)
      ? finder.leads.map((lead) => ({
          company: typeof lead.company === "string" ? lead.company : "",
          cnpj:
            typeof lead.cnpj === "string"
              ? lead.cnpj
              : typeof lead.contact === "string"
                ? lead.contact
                : "",
          fobValue:
            typeof lead.fobValue === "string"
              ? lead.fobValue
              : typeof lead.stage === "string"
                ? lead.stage
                : "",
          date: typeof lead.date === "string" ? lead.date : "",
          pdfName:
            typeof lead.pdfName === "string"
              ? lead.pdfName
              : typeof lead.pdfFileName === "string"
                ? lead.pdfFileName
                : "",
          pdfUrl: typeof lead.pdfUrl === "string" ? lead.pdfUrl : ""
        }))
      : []
  }));
}

async function fetchFinders() {
  const response = await fetch("/api/finders");
  if (!response.ok) {
    throw new Error("Falha ao carregar os dados.");
  }

  return normalizeFinders(await response.json());
}

async function saveFinderData() {
  const response = await fetch("/api/finders", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(finderData)
  });

  if (!response.ok) {
    throw new Error("Falha ao salvar os dados.");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function isEligible(finder) {
  return finder.sentMinute && finder.firstReferral && isSignedAfterCutoff(finder.signedAt);
}

function isValidBrazilianDate(value) {
  return /^(\d{2})\/(\d{2})\/(\d{4})$/.test(value.trim());
}

function parseBrazilianDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    parsedDate.getFullYear() !== Number(year) ||
    parsedDate.getMonth() !== Number(month) - 1 ||
    parsedDate.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsedDate;
}

function requestSignedDate(currentValue = "") {
  const input = window.prompt("Informe a data da assinatura no formato dd/mm/aaaa", currentValue || "16/04/2026");
  if (input === null) {
    return null;
  }

  const formatted = input.trim();
  if (!isValidBrazilianDate(formatted)) {
    window.alert("Use uma data valida no formato dd/mm/aaaa.");
    return null;
  }

  return formatted;
}

function isSignedAfterCutoff(signedAt) {
  const signedDate = parseBrazilianDate(signedAt);
  const cutoffDate = parseBrazilianDate(SIGNED_CUTOFF_DATE);

  if (!signedDate || !cutoffDate) {
    return false;
  }

  return signedDate >= cutoffDate;
}

function getEligibleFinders() {
  return finderData.filter(isEligible);
}

function formatCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data indisponivel";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getSortedFinders() {
  return [...finderData].reverse();
}

function getSelectedFinder() {
  return finderData.find((finder) => finder.id === selectedFinderId) ?? finderData[0] ?? null;
}

function hideUndoToast() {
  if (undoToastTimeoutId) {
    clearTimeout(undoToastTimeoutId);
    undoToastTimeoutId = null;
  }
  undoToast.hidden = true;
}

function showUndoToast(name) {
  undoToastText.textContent = `${name} removido.`;
  undoToast.hidden = false;
  if (undoToastTimeoutId) {
    clearTimeout(undoToastTimeoutId);
  }
  undoToastTimeoutId = window.setTimeout(() => {
    lastDeletedFinder = null;
    hideUndoToast();
  }, 8000);
}

function getLeadMarkup(finder) {
  const leads = finder.leads ?? [];

  const leadItems = leads.length
    ? leads
        .map(
          (lead, index) => `
            <article class="lead-item">
              <div class="lead-item-header">
                <strong>${lead.company}</strong>
                <button class="lead-remove-button" type="button" data-lead-index="${index}" aria-label="Excluir LEAD" title="Excluir LEAD">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 12c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8z"
                    />
                  </svg>
                </button>
              </div>
              <span>CNPJ: ${lead.cnpj}</span>
              <span>Valor FOB: ${lead.fobValue}</span>
              ${lead.pdfName ? `<span>PDF: ${lead.pdfName}</span>` : ""}
              ${lead.pdfUrl ? `<a class="lead-pdf-link" href="${lead.pdfUrl}" target="_blank" rel="noreferrer">Abrir PDF</a>` : ""}
              <small>Indicacao em ${lead.date}</small>
            </article>
          `
        )
        .join("")
    : '<div class="lead-empty">Este Finder ainda nao possui indicacoes de LEAD registradas.</div>';

  return `
    <div class="finder-leads-inline">
      <div class="finder-leads-inline-header">
        <div>
          <span class="section-label">Indicacoes</span>
          <h4>LEADs de ${finder.name}</h4>
        </div>
        <span class="summary-total">${leads.length} ${leads.length === 1 ? "lead" : "leads"}</span>
      </div>
      <form class="lead-form" data-finder-id="${finder.id}">
        <div class="lead-form-grid">
          <label class="field">
            <span>Empresa *</span>
            <input name="lead-company" type="text" placeholder="Ex.: Nova Aurora" required />
          </label>
          <label class="field">
            <span>CNPJ *</span>
            <input name="lead-cnpj" type="text" placeholder="Ex.: 12.345.678/0001-90" required />
          </label>
          <label class="field">
            <span>Valor FOB *</span>
            <input name="lead-fob-value" type="text" placeholder="Ex.: USD 120.000" required />
          </label>
          <label class="field">
            <span>Data da indicacao *</span>
            <input name="lead-date" type="text" placeholder="Ex.: 16/04/2026" required />
          </label>
        </div>
        <label class="field field-file">
          <span>Arquivo PDF</span>
          <input name="lead-pdf" type="file" accept="application/pdf,.pdf" />
        </label>
        <button class="submit-button" type="submit">Adicionar LEAD ao Finder</button>
      </form>
      <div class="lead-list">${leadItems}</div>
    </div>
  `;
}

function renderFinderCards() {
  finderGrid.innerHTML = "";

  getSortedFinders().forEach((finder) => {
    const eligible = isEligible(finder);
    const card = document.createElement("article");
    card.className = `finder-item${finder.id === selectedFinderId ? " is-active" : ""}`;
    card.innerHTML = `
      <div class="finder-name-group">
        <input class="finder-name-input" type="text" value="${finder.name}" aria-label="Nome do Finder" />
        <button class="finder-name-button" type="button">${finder.id === selectedFinderId ? "Omitir" : "Ver"}</button>
      </div>
      <span>Assinado em ${finder.signedAt || "--/--/----"}</span>
      <b>${eligible ? "Apto" : "Pendente"}</b>
      <div class="finder-edit-grid">
        <label class="finder-switch ${finder.sentMinute ? "is-yes" : "is-no"}">
          <input class="finder-status-input" data-field="sentMinute" type="checkbox" ${finder.sentMinute ? "checked" : ""} />
          <span>Assinada</span>
        </label>
        <div class="finder-actions">
          <label class="finder-switch ${finder.firstReferral ? "is-yes" : "is-no"}">
            <input class="finder-status-input" data-field="firstReferral" type="checkbox" ${finder.firstReferral ? "checked" : ""} />
            <span>Indicacao</span>
          </label>
          <button class="finder-remove-button" type="button" aria-label="Remover Finder" title="Remover Finder">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 12c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8z"
              />
            </svg>
          </button>
        </div>
      </div>
      ${finder.id === selectedFinderId ? getLeadMarkup(finder) : ""}
    `;
    card.querySelector(".finder-name-button").addEventListener("click", () => {
      selectedFinderId = selectedFinderId === finder.id ? null : finder.id;
      renderFinderCards();
    });
    const nameInput = card.querySelector(".finder-name-input");
    nameInput.addEventListener("input", async () => {
      const nextName = nameInput.value.trim();

      if (!nextName) {
        return;
      }

      finder.name = nextName;
      await saveFinderData();
      updateGauge();
    });
    card.querySelectorAll(".finder-status-input").forEach((input) => {
      input.addEventListener("change", async (event) => {
        const field = event.target.dataset.field;

        if (field === "sentMinute") {
          if (event.target.checked) {
            const signedAt = requestSignedDate(finder.signedAt);
            if (!signedAt) {
              event.target.checked = false;
              renderFinderCards();
              return;
            }

            finder.sentMinute = true;
            finder.signedAt = signedAt;
          } else {
            const shouldClearSignedAt = window.confirm("Deseja remover a assinatura deste Finder?");
            if (!shouldClearSignedAt) {
              renderFinderCards();
              return;
            }

            finder.sentMinute = false;
            finder.signedAt = "";
          }
        } else {
          finder[field] = event.target.checked;
        }

        await saveFinderData();
        renderFinderCards();
        updateGauge();
      });
    });
    card.querySelector(".finder-remove-button").addEventListener("click", async () => {
      const shouldDelete = window.confirm(`Tem certeza de que deseja excluir ${finder.name}?`);
      if (!shouldDelete) {
        return;
      }

      const finderIndex = finderData.findIndex((item) => item.id === finder.id);
      if (finderIndex === -1) {
        return;
      }

      lastDeletedFinder = {
        finder: { ...finder, leads: [...finder.leads] },
        index: finderIndex,
        previousSelectedFinderId: selectedFinderId
      };

      finderData.splice(finderIndex, 1);
      await saveFinderData();

      if (selectedFinderId === finder.id) {
        selectedFinderId = finderData[0]?.id ?? null;
      }

      renderFinderCards();
      updateGauge();
      showUndoToast(finder.name);
    });
    const leadForm = card.querySelector(".lead-form");
    if (leadForm) {
      leadForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(leadForm);
        const company = String(formData.get("lead-company") ?? "").trim();
        const cnpj = String(formData.get("lead-cnpj") ?? "").trim();
        const fobValue = String(formData.get("lead-fob-value") ?? "").trim();
        const date = String(formData.get("lead-date") ?? "").trim();
        const pdfFile = leadForm.querySelector('input[name="lead-pdf"]')?.files?.[0] ?? null;

        if (!company || !cnpj || !fobValue || !date) {
          return;
        }

        let pdfDataUrl = "";
        if (pdfFile) {
          try {
            pdfDataUrl = await readFileAsDataUrl(pdfFile);
          } catch {
            return;
          }
        }

        let pdfPayload = { pdfName: "", pdfUrl: "" };
        if (pdfDataUrl) {
          const uploadResponse = await fetch("/api/upload-pdf", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              fileName: pdfFile.name,
              dataUrl: pdfDataUrl
            })
          });

          if (!uploadResponse.ok) {
            return;
          }

          pdfPayload = await uploadResponse.json();
        }

        finder.leads.unshift({
          company,
          cnpj,
          fobValue,
          date,
          pdfName: pdfPayload.fileName ?? "",
          pdfUrl: pdfPayload.pdfUrl ?? ""
        });

        await saveFinderData();
        renderFinderCards();
      });
    }
    card.querySelectorAll(".lead-remove-button").forEach((button) => {
      button.addEventListener("click", async () => {
        const leadIndex = Number(button.dataset.leadIndex);
        const lead = finder.leads[leadIndex];

        if (!lead) {
          return;
        }

        const shouldDeleteLead = window.confirm(`Tem certeza de que deseja excluir o LEAD ${lead.company}?`);
        if (!shouldDeleteLead) {
          return;
        }

        finder.leads.splice(leadIndex, 1);
        await saveFinderData();
        renderFinderCards();
      });
    });
    finderGrid.appendChild(card);
  });
}

function updateGauge() {
  const eligibleFinders = getEligibleFinders();
  const totalFinders = finderData.length;
  const gaugeMax = Math.max(6, totalFinders);
  const progress = totalFinders === 0 ? 0 : (eligibleFinders.length / gaugeMax) * 100;

  tickMidLeft.textContent = String(Math.max(1, Math.round(gaugeMax * 0.33)));
  tickMidRight.textContent = String(Math.max(2, Math.round(gaugeMax * 0.66)));
  tickMax.textContent = String(gaugeMax);

  gaugeProgress.style.strokeDasharray = `${progress} 100`;
  leadCount.textContent = String(eligibleFinders.length);
  totalLeads.textContent = `${totalFinders} finders`;
  eligibilityStatus.textContent = `${eligibleFinders.length} aptos no grafico`;
}

finderForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = finderNameInput.value.trim();
  if (!name) {
    return;
  }

  let signedAt = "";
  if (sentMinuteInput.checked) {
    const requestedSignedAt = requestSignedDate();
    if (!requestedSignedAt) {
      return;
    }

    signedAt = requestedSignedAt;
  }

  const newFinder = {
    id: `${slugify(name)}-${Date.now()}`,
    name,
    sentMinute: sentMinuteInput.checked,
    signedAt,
    firstReferral: firstReferralInput.checked,
    createdAt: new Date().toISOString(),
    leads: []
  };

  finderData.push(newFinder);

  selectedFinderId = newFinder.id;
  await saveFinderData();
  finderForm.reset();
  renderFinderCards();
  updateGauge();
});

undoButton.addEventListener("click", async () => {
  if (!lastDeletedFinder) {
    return;
  }

  finderData.splice(lastDeletedFinder.index, 0, lastDeletedFinder.finder);
  selectedFinderId = lastDeletedFinder.previousSelectedFinderId ?? lastDeletedFinder.finder.id;
  lastDeletedFinder = null;
  await saveFinderData();
  renderFinderCards();
  updateGauge();
  hideUndoToast();
});

undoCloseButton.addEventListener("click", () => {
  lastDeletedFinder = null;
  hideUndoToast();
});

renderFinderCards();
updateGauge();

init();

async function init() {
  try {
    const loadedFinders = await fetchFinders();
    finderData.splice(0, finderData.length, ...(loadedFinders.length ? loadedFinders : defaultFinderData));
    selectedFinderId = null;
    renderFinderCards();
    updateGauge();
  } catch (error) {
    finderData.splice(0, finderData.length, ...defaultFinderData);
    selectedFinderId = null;
    renderFinderCards();
    updateGauge();
    await saveFinderData();
  }
}
