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

const defaultFinderData = initialFinderNames.map((name) => ({
  id: slugify(name),
  name,
  sentMinute: false,
  signedAt: "",
  firstReferral: false,
  createdAt: new Date().toISOString(),
  leads: []
}));

const FINDERS_STORAGE_KEY = "finders-dashboard-cache";
const finderData = [];

let selectedFinderId = null;
let lastDeletedFinder = null;
let undoToastTimeoutId = null;
let editingLeadId = null;

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

function ensureSupabase() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    throw new Error("Supabase nao configurado.");
  }
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string" && error.message) {
    return error.message;
  }

  if (typeof error.error_description === "string" && error.error_description) {
    return error.error_description;
  }

  if (typeof error.details === "string" && error.details) {
    return error.details;
  }

  return fallbackMessage;
}

function saveFindersToCache() {
  try {
    window.localStorage.setItem(FINDERS_STORAGE_KEY, JSON.stringify(finderData));
  } catch (error) {
    console.error("Nao foi possivel salvar o cache local dos finders.", error);
  }
}

function loadFindersFromCache() {
  try {
    const cached = window.localStorage.getItem(FINDERS_STORAGE_KEY);
    if (!cached) {
      return [];
    }

    return normalizeFinders(JSON.parse(cached));
  } catch (error) {
    console.error("Nao foi possivel carregar o cache local dos finders.", error);
    return [];
  }
}

function replaceFinderData(nextFinders) {
  finderData.splice(0, finderData.length, ...normalizeFinders(nextFinders));
  saveFindersToCache();
}

function getSupabaseHeaders(extraHeaders = {}) {
  ensureSupabase();

  return {
    apikey: window.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
    ...extraHeaders
  };
}

async function readErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }

    const text = await response.text();
    return text ? { message: text } : null;
  } catch (error) {
    return null;
  }
}

async function supabaseRequest(path, options = {}) {
  ensureSupabase();

  const {
    method = "GET",
    body,
    headers = {},
    expectJson = true
  } = options;

  const response = await fetch(`${window.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: getSupabaseHeaders({
      "Content-Type": "application/json",
      ...headers
    }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const errorPayload = await readErrorResponse(response);
    if (errorPayload && typeof errorPayload === "object") {
      throw errorPayload;
    }

    throw new Error(`Erro HTTP ${response.status}`);
  }

  if (!expectJson || response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
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
          id: typeof lead.id === "string" ? lead.id : "",
          company: typeof lead.company === "string" ? lead.company : "",
          cnpj: typeof lead.cnpj === "string" ? lead.cnpj : "",
          fobValue: typeof lead.fobValue === "string" ? lead.fobValue : "",
          date: typeof lead.date === "string" ? lead.date : "",
          createdAt: typeof lead.createdAt === "string" ? lead.createdAt : new Date().toISOString()
        }))
      : []
  }));
}

async function fetchFinders() {
  const data = await supabaseRequest(
    "finders?select=id,name,sent_minute,signed_at,first_referral,created_at,leads(id,company,cnpj,fob_value,date,created_at)&order=created_at.asc"
  );

  return normalizeFinders(
    (data ?? []).map((finder) => ({
      id: finder.id,
      name: finder.name,
      sentMinute: finder.sent_minute,
      signedAt: finder.signed_at,
      firstReferral: finder.first_referral,
      createdAt: finder.created_at,
      leads: (finder.leads ?? []).map((lead) => ({
        id: lead.id,
        company: lead.company,
        cnpj: lead.cnpj,
        fobValue: lead.fob_value,
        date: lead.date,
        createdAt: lead.created_at
      }))
    }))
  );
}

async function refreshFindersFromDatabase(preferredSelectedFinderId = selectedFinderId) {
  const loadedFinders = await fetchFinders();
  replaceFinderData(loadedFinders.length ? loadedFinders : defaultFinderData);

  if (preferredSelectedFinderId && finderData.some((finder) => finder.id === preferredSelectedFinderId)) {
    selectedFinderId = preferredSelectedFinderId;
    return;
  }

  selectedFinderId = finderData[0]?.id ?? null;
}

async function createFinderRecord(finder) {
  await supabaseRequest("finders", {
    method: "POST",
    body: {
      id: finder.id,
      name: finder.name,
      sent_minute: finder.sentMinute,
      signed_at: finder.signedAt,
      first_referral: finder.firstReferral,
      created_at: finder.createdAt
    },
    headers: {
      Prefer: "return=minimal"
    },
    expectJson: false
  });
}

async function upsertFinderRecord(finder) {
  await supabaseRequest("finders", {
    method: "POST",
    body: {
      id: finder.id,
      name: finder.name,
      sent_minute: finder.sentMinute,
      signed_at: finder.signedAt,
      first_referral: finder.firstReferral,
      created_at: finder.createdAt
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    expectJson: false
  });
}

async function seedDefaultFinders() {
  const payload = defaultFinderData.map((finder) => ({
    id: finder.id,
    name: finder.name,
    sent_minute: finder.sentMinute,
    signed_at: finder.signedAt,
    first_referral: finder.firstReferral,
    created_at: finder.createdAt
  }));

  await supabaseRequest("finders", {
    method: "POST",
    body: payload,
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    expectJson: false
  });
}

async function updateFinderRecord(finder) {
  await supabaseRequest(`finders?id=eq.${encodeURIComponent(finder.id)}`, {
    method: "PATCH",
    body: {
      name: finder.name,
      sent_minute: finder.sentMinute,
      signed_at: finder.signedAt,
      first_referral: finder.firstReferral
    },
    headers: {
      Prefer: "return=minimal"
    },
    expectJson: false
  });
}

async function deleteFinderRecord(finderId) {
  await supabaseRequest(`finders?id=eq.${encodeURIComponent(finderId)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal"
    },
    expectJson: false
  });
}

async function removeFinder(finder) {
  const shouldDelete = window.confirm(`Tem certeza de que deseja excluir ${finder.name}?`);
  if (!shouldDelete) {
    return;
  }

  const finderIndex = finderData.findIndex((item) => item.id === finder.id);
  if (finderIndex === -1) {
    return;
  }

  const deletedSnapshot = {
    finder: {
      ...finder,
      leads: [...finder.leads]
    },
    index: finderIndex,
    previousSelectedFinderId: selectedFinderId
  };

  lastDeletedFinder = deletedSnapshot;
  finderData.splice(finderIndex, 1);

  if (selectedFinderId === finder.id) {
    selectedFinderId = finderData[0]?.id ?? null;
  }

  renderFinderCards();
  updateGauge();
  saveFindersToCache();

  try {
    await deleteFinderRecord(finder.id);
    await refreshFindersFromDatabase();
    showUndoToast(finder.name);
  } catch (error) {
    finderData.splice(deletedSnapshot.index, 0, deletedSnapshot.finder);
    selectedFinderId = deletedSnapshot.previousSelectedFinderId ?? deletedSnapshot.finder.id;
    lastDeletedFinder = null;
    renderFinderCards();
    updateGauge();
    console.error(error);
    window.alert(getErrorMessage(error, "Nao foi possivel remover o Finder agora. Tente novamente."));
  }
}

async function restoreFinderRecord(deletedFinder) {
  await createFinderRecord(deletedFinder.finder);

  if ((deletedFinder.finder.leads ?? []).length === 0) {
    return;
  }

  const leadsPayload = deletedFinder.finder.leads.map((lead) => ({
    id: lead.id,
    finder_id: deletedFinder.finder.id,
    company: lead.company,
    cnpj: lead.cnpj,
    fob_value: lead.fobValue,
    date: lead.date,
    created_at: lead.createdAt || new Date().toISOString()
  }));

  await supabaseRequest("leads", {
    method: "POST",
    body: leadsPayload,
    headers: {
      Prefer: "return=minimal"
    },
    expectJson: false
  });
}

async function createLeadRecord(finderId, lead) {
  const data = await supabaseRequest("leads", {
    method: "POST",
    body: {
      finder_id: finderId,
      company: lead.company,
      cnpj: lead.cnpj,
      fob_value: lead.fobValue,
      date: lead.date,
      created_at: lead.createdAt
    },
    headers: {
      Prefer: "return=representation"
    }
  });

  return Array.isArray(data) ? data[0] : data;
}

async function updateLeadRecord(lead) {
  await supabaseRequest(`leads?id=eq.${encodeURIComponent(lead.id)}`, {
    method: "PATCH",
    body: {
      company: lead.company,
      cnpj: lead.cnpj,
      fob_value: lead.fobValue,
      date: lead.date
    },
    headers: {
      Prefer: "return=minimal"
    },
    expectJson: false
  });
}

async function addLeadToFinder(finder, leadForm) {
  const formData = new FormData(leadForm);
  const company = String(formData.get("lead-company") ?? "").trim();
  const cnpj = String(formData.get("lead-cnpj") ?? "").trim();
  const fobValue = String(formData.get("lead-fob-value") ?? "").trim();
  const date = String(formData.get("lead-date") ?? "").trim();

  if (!company || !cnpj || !fobValue || !date) {
    window.alert("Preencha todos os campos do LEAD antes de adicionar.");
    return;
  }

  if (!isValidBrazilianDate(date)) {
    window.alert("Use uma data valida no formato dd/mm/aaaa para a indicacao.");
    return;
  }

  const submitButton = leadForm.querySelector(".submit-button");
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
  }

  const newLead = {
    company,
    cnpj,
    fobValue,
    date,
    createdAt: new Date().toISOString()
  };

  try {
    await upsertFinderRecord(finder);
    await createLeadRecord(finder.id, newLead);
    await refreshFindersFromDatabase(finder.id);
    renderFinderCards();
  } catch (error) {
    console.error(error);
    window.alert(getErrorMessage(error, "Nao foi possivel adicionar o LEAD no Supabase."));
  } finally {
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
  }
}

async function deleteLeadRecord(leadId) {
  await supabaseRequest(`leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal"
    },
    expectJson: false
  });
}

function isEligible(finder) {
  return finder.sentMinute && finder.firstReferral && isSignedInApril(finder.signedAt);
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

function isSignedInApril(signedAt) {
  const signedDate = parseBrazilianDate(signedAt);
  if (!signedDate) {
    return false;
  }

  return signedDate.getMonth() === 3;
}

function getEligibleFinders() {
  return finderData.filter(isEligible);
}

function getSortedFinders() {
  return [...finderData].sort((left, right) => {
    const leftDate = parseBrazilianDate(left.signedAt);
    const rightDate = parseBrazilianDate(right.signedAt);
    const leftCreatedAt = Date.parse(left.createdAt || "");
    const rightCreatedAt = Date.parse(right.createdAt || "");

    if (!leftDate && !rightDate) {
      if (Number.isNaN(leftCreatedAt) && Number.isNaN(rightCreatedAt)) {
        return left.name.localeCompare(right.name, "pt-BR");
      }

      if (Number.isNaN(leftCreatedAt)) {
        return 1;
      }

      if (Number.isNaN(rightCreatedAt)) {
        return -1;
      }

      return rightCreatedAt - leftCreatedAt;
    }

    if (!leftDate) {
      return 1;
    }

    if (!rightDate) {
      return -1;
    }

    const signedAtDifference = rightDate.getTime() - leftDate.getTime();
    if (signedAtDifference !== 0) {
      return signedAtDifference;
    }

    if (Number.isNaN(leftCreatedAt) && Number.isNaN(rightCreatedAt)) {
      return left.name.localeCompare(right.name, "pt-BR");
    }

    if (Number.isNaN(leftCreatedAt)) {
      return 1;
    }

    if (Number.isNaN(rightCreatedAt)) {
      return -1;
    }

    return rightCreatedAt - leftCreatedAt;
  });
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

function getLeadItemMarkup(lead, index) {
  const isEditing = editingLeadId === lead.id;

  if (isEditing) {
    return `
      <article class="lead-item lead-item--editing">
        <form class="lead-edit-form" data-lead-index="${index}">
          <div class="lead-item-header">
            <strong>Editando LEAD</strong>
            <div class="lead-item-actions">
              <button class="lead-save-button" type="submit" aria-label="Salvar LEAD" title="Salvar LEAD">Salvar</button>
              <button class="lead-cancel-button" type="button" data-lead-index="${index}" aria-label="Cancelar edicao" title="Cancelar edicao">Cancelar</button>
            </div>
          </div>
          <div class="lead-edit-grid">
            <label class="field">
              <span>Empresa *</span>
              <input name="edit-lead-company" type="text" value="${lead.company}" required />
            </label>
            <label class="field">
              <span>CNPJ *</span>
              <input name="edit-lead-cnpj" type="text" value="${lead.cnpj}" required />
            </label>
            <label class="field">
              <span>Valor FOB *</span>
              <input name="edit-lead-fob-value" type="text" value="${lead.fobValue}" required />
            </label>
            <label class="field">
              <span>Data da indicacao *</span>
              <input name="edit-lead-date" type="text" value="${lead.date}" required />
            </label>
          </div>
        </form>
      </article>
    `;
  }

  return `
    <article class="lead-item">
      <div class="lead-item-header">
        <strong>${lead.company}</strong>
        <div class="lead-item-actions">
          <button class="lead-edit-button" type="button" data-lead-index="${index}" aria-label="Editar LEAD" title="Editar LEAD">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79z" />
            </svg>
          </button>
          <button class="lead-remove-button" type="button" data-lead-index="${index}" aria-label="Excluir LEAD" title="Excluir LEAD">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 12c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8z" />
            </svg>
          </button>
        </div>
      </div>
      <span>CNPJ: ${lead.cnpj}</span>
      <span>Valor FOB: ${lead.fobValue}</span>
      <small>Indicacao em ${lead.date}</small>
    </article>
  `;
}

function getLeadMarkup(finder) {
  const leads = finder.leads ?? [];

  const leadItems = leads.length
    ? leads.map((lead, index) => getLeadItemMarkup(lead, index)).join("")
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
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 12c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8z" />
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
      try {
        await updateFinderRecord(finder);
        await refreshFindersFromDatabase(finder.id);
        updateGauge();
        renderFinderCards();
      } catch (error) {
        console.error(error);
        window.alert(getErrorMessage(error, "Nao foi possivel atualizar o Finder no Supabase."));
      }
    });

    card.querySelectorAll(".finder-status-input").forEach((input) => {
      input.addEventListener("change", async (event) => {
        const field = event.target.dataset.field;

        if (field === "sentMinute") {
          if (event.target.checked) {
            const signedAt = requestSignedDate(finder.signedAt);
            if (!signedAt) {
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

        try {
          await updateFinderRecord(finder);
          await refreshFindersFromDatabase(finder.id);
          renderFinderCards();
          updateGauge();
        } catch (error) {
          console.error(error);
          window.alert(getErrorMessage(error, "Nao foi possivel atualizar o Finder no Supabase."));
        }
      });
    });

    card.querySelector(".finder-remove-button").addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await removeFinder(finder);
    });

    const leadForm = card.querySelector(".lead-form");
    if (leadForm) {
      leadForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await addLeadToFinder(finder, leadForm);
      });
    }

    card.querySelectorAll(".lead-edit-button").forEach((button) => {
      button.addEventListener("click", () => {
        const leadIndex = Number(button.dataset.leadIndex);
        const lead = finder.leads[leadIndex];
        if (!lead) {
          return;
        }

        editingLeadId = lead.id;
        renderFinderCards();
      });
    });

    card.querySelectorAll(".lead-cancel-button").forEach((button) => {
      button.addEventListener("click", () => {
        editingLeadId = null;
        renderFinderCards();
      });
    });

    card.querySelectorAll(".lead-edit-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const leadIndex = Number(form.dataset.leadIndex);
        const lead = finder.leads[leadIndex];
        if (!lead) {
          return;
        }

        const formData = new FormData(form);
        const updatedLead = {
          ...lead,
          company: String(formData.get("edit-lead-company") ?? "").trim(),
          cnpj: String(formData.get("edit-lead-cnpj") ?? "").trim(),
          fobValue: String(formData.get("edit-lead-fob-value") ?? "").trim(),
          date: String(formData.get("edit-lead-date") ?? "").trim()
        };

        if (!updatedLead.company || !updatedLead.cnpj || !updatedLead.fobValue || !updatedLead.date) {
          window.alert("Preencha todos os campos do LEAD antes de salvar.");
          return;
        }

        if (!isValidBrazilianDate(updatedLead.date)) {
          window.alert("Use uma data valida no formato dd/mm/aaaa para a indicacao.");
          return;
        }

        try {
          await updateLeadRecord(updatedLead);
          editingLeadId = null;
          await refreshFindersFromDatabase(finder.id);
          renderFinderCards();
        } catch (error) {
          console.error(error);
          window.alert(getErrorMessage(error, "Nao foi possivel editar o LEAD no Supabase."));
        }
      });
    });

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

        try {
          await deleteLeadRecord(lead.id);
          await refreshFindersFromDatabase(finder.id);
          renderFinderCards();
        } catch (error) {
          console.error(error);
          window.alert(getErrorMessage(error, "Nao foi possivel remover o LEAD no Supabase."));
        }
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

  try {
    await createFinderRecord(newFinder);
    await refreshFindersFromDatabase(newFinder.id);
    finderForm.reset();
    renderFinderCards();
    updateGauge();
  } catch (error) {
    console.error(error);
    window.alert(getErrorMessage(error, "Nao foi possivel salvar o Finder no Supabase."));
  }
});

undoButton.addEventListener("click", async () => {
  if (!lastDeletedFinder) {
    return;
  }

  finderData.splice(lastDeletedFinder.index, 0, lastDeletedFinder.finder);
  selectedFinderId = lastDeletedFinder.previousSelectedFinderId ?? lastDeletedFinder.finder.id;
  saveFindersToCache();
  await restoreFinderRecord(lastDeletedFinder);
  lastDeletedFinder = null;
  renderFinderCards();
  updateGauge();
  hideUndoToast();
});

undoCloseButton.addEventListener("click", () => {
  lastDeletedFinder = null;
  hideUndoToast();
});

replaceFinderData(defaultFinderData);
renderFinderCards();
updateGauge();

init();

async function init() {
  try {
    ensureSupabase();
    let loadedFinders = await fetchFinders();

    if (loadedFinders.length === 0) {
      await seedDefaultFinders();
      loadedFinders = await fetchFinders();
    }

    replaceFinderData(loadedFinders.length ? loadedFinders : defaultFinderData);
    selectedFinderId = null;
    renderFinderCards();
    updateGauge();
  } catch (error) {
    replaceFinderData(defaultFinderData);
    selectedFinderId = null;
    renderFinderCards();
    updateGauge();
    console.error(error);
    window.alert(getErrorMessage(error, "Configure o Supabase antes do deploy. Veja o README para preencher o arquivo supabase-config.js."));
  }
}
