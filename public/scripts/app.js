        // Importações do Firebase
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { 
            getAuth, 
            createUserWithEmailAndPassword, 
            signInWithEmailAndPassword, 
            signOut, 
            onAuthStateChanged,
            updateProfile
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { 
            getFirestore, 
            collection, 
            addDoc, 
            doc, 
            getDoc, 
            getDocs, 
            updateDoc, 
            deleteDoc, 
            query, 
            where, 
            onSnapshot, 
            orderBy, 
            serverTimestamp, 
            writeBatch, 
            Timestamp,
            arrayUnion,
            enableIndexedDbPersistence,
            limit,
            startAfter,
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { 
            getDatabase, 
            ref, 
            onValue 
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
        import {
            getFunctions,
            httpsCallable
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

        // Configuração do Firebase
        const firebaseConfig = {
            apiKey: "AIzaSyCyB7HEg9NsLKiV2nzi5NTVmQUVFhEwhw0",
            authDomain: "passaplantaoapp.firebaseapp.com",
            projectId: "passaplantaoapp",
            storageBucket: "passaplantaoapp.firebasestorage.app",
            messagingSenderId: "1017467548537",
            appId: "1:1017467548537:web:068d4aed081615e61435a8",
        };

        // Inicialização do Firebase
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        window.db = db;


        // --- NOVO BLOCO DE CÓDIGO PARA MONITORAMENTO PRECISO DA CONEXÃO ---

        // Inicializa o Realtime Database
        const database = getDatabase(app);
        // Cria uma referência para o caminho especial ".info/connected"
        const connectedRef = ref(database, '.info/connected');

        // Adiciona um listener que dispara sempre que o status de conexão do Firebase muda
        onValue(connectedRef, (snap) => {
            // snap.val() retornará true se conectado, false se desconectado
            if (snap.val() === true) {
                console.log("Firebase Realtime Database: Conectado.");
                updateConnectionStatus('online');
            } else {
                // Se o Firebase diz que está offline, verificamos se o navegador concorda
                // Isso evita falsos negativos durante a inicialização
                if (navigator.onLine) {
                    console.log("Firebase Realtime Database: Desconectado, mas navegador está online. Reconectando...");
                    updateConnectionStatus('connecting');
                } else {
                    console.log("Firebase Realtime Database: Desconectado.");
                    updateConnectionStatus('offline');
                }
            }
        });

        // Tenta ativar a persistência. Isso armazena os dados localmente.
        // A ativação da persistência é envolvida em uma função assíncrona auto-executável
        // para que ela não bloqueie a renderização inicial da página.
        // Isso corrige o problema de carregamento infinito em navegadores como o Safari.
        (async () => {
            try {
                await enableIndexedDbPersistence(db);
                console.log("Persistência offline do Firestore ativada com sucesso!");
            } catch (err) {
                if (err.code == 'failed-precondition') {
                    console.warn("Falha ao ativar persistência: Múltiplas abas abertas podem causar este problema.");
                } else if (err.code == 'unimplemented') {
                    console.warn("Persistência offline não suportada neste navegador.");
                }
            }
        })(); // A função é chamada imediatamente, mas o script principal não espera por sua conclusão.

        const functions = getFunctions(app);

        // --- VARIÁVEIS GLOBAIS E ESTADO DA APLICAÇÃO ---
        let currentUser = null;
        let currentPatientId = null;
        let currentScreen = 'loading';
        let unsubscribePatients = null;
        let unsubscribeHandovers = null;
        let currentHistoryPage = 1;
        const PATIENTS_PER_PAGE = 9; // Carrega 9 por vez (bom para grids de 3 colunas)
        let lastVisiblePatientDoc = null; // Guarda o último documento para a paginação
        let isLoadingPatients = false;    // Impede carregamentos múltiplos
        let allPatientsLoaded = false;    // Indica se todos os pacientes já foram carregados
        let debounceTimer;
        let originalPatientState = { allergies: [] };
        let activePrescriptions = [];
        let administeredInShift = [];
        let medicationUITimer = null;
        let resolvedPendingExams = {};
        let currentHandovers = [];
        let currentPatientData = {};
        let currentlyViewedHandover = null;
        let currentViewMode = 'grid'; // 'grid' ou 'list'
        let currentExamsDone = [];
        let hasUnsavedChanges = false;
        let patientDetailListenersAttached = false;
        let dispositivosListenersAttached = false;
        let currentCustomDevices = [];
        let originalPatientDevices = []; // Para calcular o delta ao salvar
        let activeEditingModule = null;
        let activeSelectorInfo = null;
        let flatpickrInstance = null;
        let currentShiftCompletedExams = [];
        let currentShiftRescheduledExams = [];
        let currentPatientList = [];
        let devicesAddedThisSession = []; 
        let unsubscribeNotifications = null; // Para o listener de notificações
        let allNotifications = [];           // Para guardar a lista de notificações
        let weeklySummaryChart = null;
        let fugulinChart = null;
        let medicationChart = null;
        let unitTrendsChart = null;
        let unitFlowChart = null;
        let currentUnitSummaryData = null;
        let dosesToRender = [];

        // Modal de Medicações
        const showUnitMedicationsButton = document.getElementById('show-unit-medications-button');
        const unitMedicationsModal = document.getElementById('unit-medications-modal');
        const closeUnitMedicationsModalButton = document.getElementById('close-unit-medications-modal-button');
        const unitMedicationsContent = document.getElementById('unit-medications-content');
        const medicationAlertIndicator = document.getElementById('medication-alert-indicator');
        const deletePrescriptionConfirmModal = document.getElementById('delete-prescription-confirm-modal');
        const confirmDeletePrescriptionButton = document.getElementById('confirm-delete-prescription-button');
        const cancelDeletePrescriptionButton = document.getElementById('cancel-delete-prescription-button');

        // Modal de Última Passagem de Plantão
        const showLastHandoverButton = document.getElementById('show-last-handover-button');
        const lastHandoverModal = document.getElementById('last-handover-modal');
        const closeLastHandoverModalBtn = document.getElementById('close-last-handover-modal');
        const lastHandoverContent = document.getElementById('last-handover-content');

        // Mapeamento para os tooltips dos dispositivos
        const deviceTooltips = {
            'AVP MSE': 'Acesso Venoso Periférico em Membro Superior Esquerdo',
            'AVP MSD': 'Acesso Venoso Periférico em Membro Superior Direito',
            'PICC': 'Cateter Central de Inserção Periférica',
            'CVC': 'Cateter Venoso Central',
            'CDL': 'Cateter de Duplo Lúmen para Hemodiálise',
            'SNE': 'Sonda Nasoenteral',
            'GTT': 'Gastrostomia',
            'SVD': 'Sonda Vesical de Demora',
            'Monitor': 'Monitorização Cardíaca Contínua'
        };

        // Ordem de severidade para a legenda do gráfico Fugulin
        const FUGULIN_CLASSIFICATION_ORDER = [
            'Cuidados Mínimos',
            'Cuidados Intermediários',
            'Cuidados de Alta Dependência',
            'Cuidados Semi-Intensivos',
            'Cuidados Intensivos',
            'Não Classificado'
        ];

        // Mapeamento de classificação Fugulin para as cores do gráfico, garantindo consistência.
        const FUGULIN_CHART_COLORS = {
            'Cuidados Mínimos': '#dcfce7',            // Verde (bg-green-100)
            'Cuidados Intermediários': '#fef9c3',     // Amarelo (bg-yellow-100)
            'Cuidados de Alta Dependência': '#ffedd5',// Laranja Claro (bg-orange-100)
            'Cuidados Semi-Intensivos': '#fee2e2',     // Vermelho Claro (bg-red-100)
            'Cuidados Intensivos': '#fecaca',          // Vermelho Escuro (bg-red-200)
            'Não Classificado': '#dbeafe'              // Azul (bg-blue-100)
        };

        const FUGULIN_CHART_BORDERS = {
            'Cuidados Mínimos': '#166534',            // text-green-800
            'Cuidados Intermediários': '#854d0e',     // text-yellow-800
            'Cuidados de Alta Dependência': '#9a3412',// text-orange-800
            'Cuidados Semi-Intensivos': '#960e0e',     // text-red-700
            'Cuidados Intensivos': '#510909',          // text-red-900
            'Não Classificado': '#1e40af'              // text-blue-800
        };

        // Objeto com as opções padronizadas para cada tipo de cuidado
        const fugulinOptions = {
            cuidadoCorporal: [
                { text: 'Autossuficiente', value: '1' },
                { text: 'Ajuda no banho / em partes do corpo', value: '2' },
                { text: 'Banho no leito, higiene oral', value: '3' },
                { text: 'Incontinente, com lesões, curativos complexos', value: '4' }
            ],
            motilidade: [
                { text: 'Ativo, movimenta-se sozinho', value: '1' },
                { text: 'Requer mudança de decúbito programada', value: '2' },
                { text: 'Necessita de ajuda para se movimentar', value: '3' },
                { text: 'Totalmente restrito ao leito', value: '4' }
            ],
            deambulacao: [
                { text: 'Deambula sozinho, sem ajuda', value: '1' },
                { text: 'Requer auxílio para deambular', value: '2' },
                { text: 'Ajuda para transferência (leito-cadeira)', value: '3' },
                { text: 'Totalmente acamado', value: '4' }
            ],
            alimentacao: [
                { text: 'Alimenta-se sozinho', value: '1' },
                { text: 'Requer ajuda parcial / estímulo', value: '2' },
                { text: 'Alimentação por sonda (SNE/GTT)', value: '3' },
                { text: 'Nutrição Parenteral Total (NPT)', value: '4' }
            ],
            eliminacao: [
                { text: 'Independente, controle esfincteriano', value: '1' },
                { text: 'Uso de comadre / auxílio no banheiro', value: '2' },
                { text: 'Sonda Vesical de Demora (SVD)', value: '3' },
                { text: 'Incontinência, evacuação no leito, ostomias', value: '4' }
            ]
        };

        // Objeto com as opções padronizadas para cada tipo de risco
        const riskOptions = {
            lpp: [
                "Sem Risco Aparente",
                "Risco Baixo (Braden 15-18)",
                "Risco Moderado (Braden 13-14)",
                "Risco Alto (Braden 10-12)",
                "Risco Muito Alto (Braden ≤9)"
            ],
            quedas: [
                "Sem Risco Aparente",
                "Risco Baixo (Morse 0-24)",
                "Risco Médio (Morse 25-44)",
                "Risco Alto (Morse ≥45)"
            ],
            bronco: [
                "Sem Risco Aparente",
                "Risco Baixo (Alerta, deambula, deglute bem)",
                "Risco Moderado (Sonolento, disfagia leve, tosse)",
                "Risco Alto (SNG/GTT, rebaixamento de consciência)"
            ],
            iras: [
                "Sem Fatores de Risco",
                "Uso de Dispositivo Invasivo (AVP, CVC, SVD, etc.)",
                "Paciente Imunossuprimido",
                "Colonização por MRO (Bactéria Multirresistente)",
                "Sítio Cirúrgico / Ferida Operatória"
            ]
        };

        // Novo objeto de opções
        const monitoringOptions = {
            consciencia: [
                { text: 'Alerta (A)', value: 'A' },
                { text: 'Voz (V)', value: 'V' },
                { text: 'Dor (P)', value: 'P' },
                { text: 'Não Responde (U)', value: 'U' }
            ]
        };

        // --- CONFIGURAÇÕES DO FLATPICKR ---

        // Configuração para o SELETOR DE TEMPO de medicações
        const configTimePicker = {
            enableTime: true,    // Habilita a seleção de tempo
            noCalendar: true,    // Esconde o calendário, mostrando apenas o relógio
            dateFormat: "H:i",   // Formato de 24h para o relógio
            time_24hr: true,
            minuteIncrement: 5,  // Incrementos de 5 em 5 minutos
            locale: "pt",
            allowInput: true // Permite a digitação manual
        };

        // Configuração para AGENDAR (não permite datas passadas)
        const configAgendamento = {
            enableTime: true,
            dateFormat: "d/m/Y H:i", // Formato brasileiro
            time_24hr: true,
            defaultDate: new Date(), // Padrão: data e hora atuais
            minDate: "today", // Não permite selecionar datas/horas passadas
            minuteIncrement: 30, // Incremento dos minutos de 30 em 30
            locale: "pt", // (Opcional, mas traduz o calendário - requer um script extra)
            allowInput: true, // Permite a digitação manual
            onKeyDown: (selectedDates, dateStr, instance, e) => {
                if (e.key === 'Enter') {
                    // Impede que o "Enter" se propague e acione outros listeners (como o de salvar)
                    e.stopPropagation();
                    e.preventDefault();
                    // Força o flatpickr a analisar e definir a data a partir do que foi digitado
                    instance.setDate(dateStr, true);
                }
            }
        };

        // Configuração para REGISTRAR (não permite datas futuras)
        const configRegistro = {
            enableTime: true,
            dateFormat: "d/m/Y H:i",
            time_24hr: true,
            defaultDate: new Date(),
            maxDate: new Date(), // Não permite selecionar datas/horas futuras
            minuteIncrement: 30,
            locale: "pt",
            allowInput: true, // Permite a digitação manual
            onKeyDown: (selectedDates, dateStr, instance, e) => {
                if (e.key === 'Enter') {
                    e.stopPropagation();
                    e.preventDefault();
                    instance.setDate(dateStr, true);
                }
            }
        };

        // Para data de nascimento
        const configDatePickerNascimento = {
            dateFormat: "Y-m-d",    // Formato que o banco de dados entende
            altInput: true,         // Mostra um formato amigável para o usuário
            altFormat: "d/m/Y",     // Formato brasileiro amigável
            locale: "pt",           // Usa a tradução para português
            maxDate: "today",       // Impede a seleção de datas futuras
            // Define uma data inicial padrão mais realista (30 anos atrás)
            defaultDate: new Date().setFullYear(new Date().getFullYear() - 30),
            allowInput: true // Permite a digitação manual
        };

        // --- ELEMENTOS DA UI ---

        // Modal de Dispositivos
        const dispositivosGrid = document.getElementById('dispositivos-grid');
        const dispositivoOutrosChk = document.getElementById('dispositivo-outros-chk');
        const outrosDispositivosInputWrapper = document.getElementById('outros-dispositivos-input-wrapper');
        const dispositivoOutrosInput = document.getElementById('dispositivo-outros-input');
        const customDispositivosContainer = document.getElementById('custom-dispositivos-container');
        const addCustomDispositivoBtn = document.getElementById('add-custom-dispositivo-btn');

        // Modal de Histórico de Módulo
        const moduleHistoryModal = document.getElementById('module-history-modal');
        const moduleHistoryTitle = document.getElementById('module-history-title');
        const moduleHistoryContent = document.getElementById('module-history-content');
        const closeModuleHistoryModalBtn = document.getElementById('close-module-history-modal');

        // Modal de Histórico Completo
        const fullHistoryModal = document.getElementById('full-history-modal');
        const closeFullHistoryModalBtn = document.getElementById('close-full-history-modal');
        const fullHistoryContentWrapper = document.getElementById('full-history-content-wrapper'); // Usaremos para os eventos

        // Modal de Exames Realizados
        const addDoneExamBtn = document.getElementById('add-done-exam-btn');
        const formExamDoneName = document.getElementById('form-exam-done-name');
        const formExamDoneResult = document.getElementById('form-exam-done-result');

        // Modal de Visualização de Plantão
        const viewHandoverModal = document.getElementById('view-handover-modal');
        const viewHandoverTitle = document.getElementById('view-handover-title');
        const viewHandoverContent = document.getElementById('view-handover-content');
        const closeViewHandoverModalBtn = document.getElementById('close-view-handover-modal');
        const patientSummaryModal = document.getElementById('patient-summary-modal');
        const showSummaryButton = document.getElementById('show-summary-button');
        const closeSummaryModalButton = document.getElementById('close-summary-modal-button');
        const patientSummaryContent = document.getElementById('patient-summary-content');

        // Modal de Resumo da Unidade
        const showUnitSummaryButton = document.getElementById('show-unit-summary-button');
        const unitSummaryModal = document.getElementById('unit-summary-modal');
        const closeUnitSummaryModalButton = document.getElementById('close-unit-summary-modal-button');
        const printUnitSummaryButton = document.getElementById('print-unit-summary-button');


        // Seletores de Notificações
        const notificationBellBtn = document.getElementById('notification-bell-btn');
        const notificationPanel = document.getElementById('notification-panel');
        const notificationList = document.getElementById('notification-list');
        const notificationIndicator = document.getElementById('notification-indicator');

        const examsDoneTextarea = document.getElementById('form-exams-done'); // MANTENHA ESTA LINHA POR ENQUANTO, VAMOS REMOVÊ-LA DEPOIS

        const screens = {
            loading: document.getElementById('loading-screen'),
            login: document.getElementById('login-screen'),
            register: document.getElementById('register-screen'),
            main: document.getElementById('main-content'),
            patientDetail: document.getElementById('patient-detail-screen')
        };

        // Autenticação
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const logoutButton = document.getElementById('logout-button');
        const userInfo = document.getElementById('user-info');

        // Painel de Pacientes (Dashboard)
        const patientList = document.getElementById('patient-list');
        const searchPatientInput = document.getElementById('search-patient');

        // Modais de Adicionar/Editar Paciente
        const addPatientModal = document.getElementById('add-patient-modal');
        const addPatientButton = document.getElementById('add-patient-button');
        const closeModalButton = document.getElementById('close-modal-button');
        const addPatientForm = document.getElementById('add-patient-form');
        const editPatientModal = document.getElementById('edit-patient-modal');
        const closeEditModalButton = document.getElementById('close-edit-modal-button');
        const editPatientForm = document.getElementById('edit-patient-form');
        const editPatientDetailsButton = document.getElementById('edit-patient-details-button');

        // Modal de Exclusão
        const deleteConfirmModal = document.getElementById('delete-confirm-modal');
        const confirmDeleteButton = document.getElementById('confirm-delete-button');
        const cancelDeleteButton = document.getElementById('cancel-delete-button');
        const cancelExamConfirmModal = document.getElementById('cancel-exam-confirm-modal');
        const confirmCancelExamButton = document.getElementById('confirm-cancel-exam-button');
        const cancelCancelExamButton = document.getElementById('cancel-cancel-exam-button');

        // Botões de Voltar dos Modais
        const backToHistoryListBtn = document.getElementById('back-to-history-list-btn');
        const backToLastHandoverBtn = document.getElementById('back-to-last-handover-btn');

        // Detalhes do Paciente e Formulário de Plantão
        const backToDashboardButton = document.getElementById('back-to-dashboard');
        const deletePatientButton = document.getElementById('delete-patient-button');
        const patientDetailName = document.getElementById('patient-detail-name');
        const patientDetailNumber = document.getElementById('patient-detail-number');
        const patientDetailRoom = document.getElementById('patient-detail-room');
        const patientDetailAge = document.getElementById('patient-detail-age');
        const handoversList = document.getElementById('handovers-list');
        const addHandoversForm = document.getElementById('add-handovers-form');

        // Filtro de Leitos
        const bedFilterContainer = document.getElementById('bed-filter-container');
        const bedFilterButton = document.getElementById('bed-filter-button');
        const bedFilterButtonText = document.getElementById('bed-filter-button-text');
        const bedFilterDropdown = document.getElementById('bed-filter-dropdown');
        const bedSearchInput = document.getElementById('bed-search-input');
        const bedFilterList = document.getElementById('bed-filter-list');
        const bedFilterClearButton = document.getElementById('bed-filter-clear-button');
        const bedFilterClearWrapper = document.getElementById('bed-filter-clear-wrapper');
        const bedFilterArrowIcon = document.getElementById('bed-filter-arrow-icon');

        // Campos do Formulário Avançado
        const diagnosisInput = document.getElementById('form-diagnosis');
        const diagnosisAutocompleteContainer = document.getElementById('diagnosis-autocomplete-container');
        const diagnosisAutocompleteList = document.getElementById('diagnosis-autocomplete-list');
        const medicationInput = document.getElementById('form-medications');
        const medicationAutocompleteContainer = document.getElementById('medication-autocomplete-container');
        const medicationAutocompleteList = document.getElementById('medication-autocomplete-list');
        const diagnosesTagsContainer = document.getElementById('diagnoses-tags-container');
        const comorbiditiesTagsContainer = document.getElementById('comorbidities-tags-container');
        const scheduledExamsTagsContainer = document.getElementById('scheduled-exams-tags-container');
        const pendingExamsTagsContainer = document.getElementById('pending-exams-tags-container');
        const addScheduledExamBtn = document.getElementById('add-scheduled-exam-btn');
        const medicationsListContainer = document.getElementById('medications-list-container');
        const recentMedsList = document.getElementById('recent-meds-list');

        // Visualização
        const viewToggleButton = document.getElementById('view-toggle-button');
        const viewToggleDropdown = document.getElementById('view-toggle-dropdown');
        const viewToggleIconGrid = document.getElementById('view-toggle-icon-grid');
        const viewToggleIconList = document.getElementById('view-toggle-icon-list');
        const noPatientsMessage = document.getElementById('no-patients-message'); // Mova ou adicione aqui para garantir que está definido

        // Área Extra de Medicações
        const medicationActionArea = document.getElementById('medication-action-area');
        const medicationEditorArea = document.getElementById('medication-editor-area');
        const medicationSearchEditor = document.getElementById('medication-search-editor');
        const medicationTimeEditor = document.getElementById('medication-time-editor');
        const cancelEditorBtn = document.getElementById('cancel-editor-btn');

        // Seletores dos botões de impressão
        const printLastHandoverButton = document.getElementById('print-last-handover-button');
        const printHandoverDetailButton = document.getElementById('print-handover-detail-button');

        // --- LÓGICA DE MEDICAÇÕES ---
        const medEditorArea = document.getElementById('medication-editor-area');
        const medEditorCloseBtn = document.getElementById('med-editor-close-btn');
        const medMainActionArea = document.getElementById('medication-main-action-area');

        const medEditor = {
            id: document.getElementById('med-editor-id'),
            mode: document.getElementById('med-editor-mode'),
            title: document.getElementById('med-editor-title'),
            name: document.getElementById('med-editor-name'),
            dose: document.getElementById('med-editor-dose'),
            startTime: document.getElementById('med-editor-start-time'),
            frequency: document.getElementById('med-editor-frequency'),
            duration: document.getElementById('med-editor-duration'),
            datetimeInput: document.getElementById('med-editor-datetime-input'),
            datetimeLabel: document.getElementById('med-editor-datetime-label'),
            backBtn: document.getElementById('med-editor-back-btn'),
            saveBtn: document.getElementById('med-editor-save-btn')
        };

        const medSteps = {
            step1: document.getElementById('med-step-1-basic-info'),
            step2: document.getElementById('med-step-2-type-selection'),
            step3a: document.getElementById('med-step-3a-single-dose-action'),
            step3b: document.getElementById('med-step-3b-continuous-dose-details'),
            step4: document.getElementById('med-step-4-datetime-picker'),
            actions: document.getElementById('med-editor-final-actions')
        };

        /**
         * FUNÇÃO DE PROCESSAMENTO
         * Itera sobre os registros de handover da semana e calcula os KPIs.
         * @param {Array} handovers - Array de objetos de handover da última semana.
         * @returns {object} - Um objeto contendo todos os KPIs calculados.
         */
        function processKPIs(handovers) {
            const kpis = {
                maxFC: { value: -Infinity, timestamp: null },
                minPAS: { value: Infinity, timestamp: null },
                maxTemp: { value: -Infinity, timestamp: null },
                minSatO2: { value: Infinity, timestamp: null },
                maxFR: { value: -Infinity, timestamp: null },
                avgFC: { value: null, count: 0 },
                avgPAS: { value: null, count: 0 },
                maxNEWS2: { value: -Infinity, timestamp: null },
                maxFugulin: { value: -Infinity, timestamp: null },
                hypoglycemiaEpisodes: { count: 0, timestamps: [] },
                feverEpisodes: { count: 0, timestamps: [] },
                sosMedCount: { count: 0, timestamps: [] }
            };

            let sumFC = 0, countFC = 0, sumPAS = 0, countPAS = 0;
            const sosMeds = ['acetilsalicilico', 'bromoprida', 'codeina', 'diazepam', 'dipirona', 'haloperidol', 'ibuprofeno', 'metoclopramida', 'midazolam', 'morfina', 'ondansetrona', 'paracetamol', 'tramadol', 'epinefrina', 'norepinefrina', 'dobutamina'];

            handovers.forEach(h => {
                const timestamp = h.timestamp?.toDate ? h.timestamp.toDate() : new Date();

                if (h.monitoring) {
                    const mon = h.monitoring;
                    const fc = parseInt(mon.fc, 10);
                    if (!isNaN(fc)) {
                        if (fc > kpis.maxFC.value) {
                            kpis.maxFC.value = fc;
                            kpis.maxFC.timestamp = timestamp;
                        }
                        sumFC += fc;
                        countFC++;
                    }
                    const fr = parseInt(mon.fr, 10);
                    if (!isNaN(fr) && fr > kpis.maxFR.value) {
                        kpis.maxFR.value = fr;
                        kpis.maxFR.timestamp = timestamp;
                    }
                    const pa = parseInt((mon.pa || '').split('/')[0], 10);
                    if (!isNaN(pa)) {
                        if (pa < kpis.minPAS.value) {
                            kpis.minPAS.value = pa;
                            kpis.minPAS.timestamp = timestamp;
                        }
                        sumPAS += pa;
                        countPAS++;
                    }
                    const temp = parseFloat((mon.temp || '').replace(',', '.'));
                    if (!isNaN(temp)) {
                        if (temp > kpis.maxTemp.value) {
                            kpis.maxTemp.value = temp;
                            kpis.maxTemp.timestamp = timestamp;
                        }
                        if (temp > 37.8) {
                            kpis.feverEpisodes.timestamps.push(timestamp);
                        }
                    }
                    const satO2 = parseInt(mon.sato2, 10);
                    if (!isNaN(satO2) && satO2 < kpis.minSatO2.value) {
                        kpis.minSatO2.value = satO2;
                        kpis.minSatO2.timestamp = timestamp;
                    }
                    const hgt = parseInt(mon.hgt, 10);
                    if (!isNaN(hgt) && hgt < 70) {
                        kpis.hypoglycemiaEpisodes.timestamps.push(timestamp);
                    }
                }

                if (h.news2?.score !== undefined && h.news2.score > kpis.maxNEWS2.value) {
                    kpis.maxNEWS2.value = h.news2.score;
                    kpis.maxNEWS2.timestamp = timestamp;
                }
                if (h.fugulin?.score !== undefined && h.fugulin.score > kpis.maxFugulin.value) {
                    kpis.maxFugulin.value = h.fugulin.score;
                    kpis.maxFugulin.timestamp = timestamp;
                }

                if (h.medicationsAdministered && Array.isArray(h.medicationsAdministered)) {
                    h.medicationsAdministered.forEach(med => {
                        const medNameLower = (med.name || '').toLowerCase();
                        if (sosMeds.some(sosMed => medNameLower.includes(sosMed))) {
                            // Converte o timestamp do Firestore para um objeto Date
                            const medTime = med.time?.toDate ? med.time.toDate() : (med.time ? new Date(med.time) : timestamp);
                            kpis.sosMedCount.timestamps.push(medTime);
                        }
                    });
                }
            });

            kpis.avgFC.value = countFC > 0 ? Math.round(sumFC / countFC) : null;
            kpis.avgFC.count = countFC;
            kpis.avgPAS.value = countPAS > 0 ? Math.round(sumPAS / countPAS) : null;
            kpis.avgPAS.count = countPAS;
            kpis.hypoglycemiaEpisodes.count = kpis.hypoglycemiaEpisodes.timestamps.length;
            kpis.feverEpisodes.count = kpis.feverEpisodes.timestamps.length;
            kpis.sosMedCount.count = kpis.sosMedCount.timestamps.length; // A contagem é feita aqui

            if (kpis.maxFC.value === -Infinity) kpis.maxFC.value = null;
            if (kpis.minPAS.value === Infinity) kpis.minPAS.value = null;
            if (kpis.maxTemp.value === -Infinity) kpis.maxTemp.value = null;
            if (kpis.minSatO2.value === Infinity) kpis.minSatO2.value = null;
            if (kpis.maxFR.value === -Infinity) kpis.maxFR.value = null;
            if (kpis.maxNEWS2.value === -Infinity) kpis.maxNEWS2.value = null;
            if (kpis.maxFugulin.value === -Infinity) kpis.maxFugulin.value = null;

            return kpis;
        }


        /**
        * FUNÇÃO DE RENDERIZAÇÃO
        * Pega os KPIs processados e renderiza os cards de destaque no DOM.
        * @param {object} kpis - O objeto retornado pela função processKPIs.
        */
        function renderKPIs(kpis) {
            const kpiPanel = document.getElementById('kpi-panel');
            if (!kpiPanel) return;

            // Helper para formatar data/hora para os tooltips
            const formatTooltipDate = (date) => {
                if (!date) return '';
                return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            };

            // Helper para criar um card individual, agora com um parâmetro para o tooltip
            const createKpiCard = (icon, label, value, unit = '', tooltipText = '') => {
                const displayValue = (value !== null && !isNaN(value)) ? value : 'N/A';
                const displayUnit = (value !== null && !isNaN(value)) ? unit : '';
                const titleAttr = tooltipText ? `title="${tooltipText}"` : '';

                return `
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center" ${titleAttr}>
                        <p class="text-xs text-gray-500 font-medium">${icon} ${label}</p>
                        <p class="text-xl font-bold text-gray-800 mt-1">
                            ${displayValue}
                            <span class="text-sm font-medium text-gray-600">${displayUnit}</span>
                        </p>
                    </div>
                `;
            };

            // Prepara o texto dos tooltips
            const maxFcTooltip = kpis.maxFC.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.maxFC.timestamp)}` : '';
            const minPasTooltip = kpis.minPAS.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.minPAS.timestamp)}` : '';
            const maxTempTooltip = kpis.maxTemp.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.maxTemp.timestamp)}` : '';
            const minSatO2Tooltip = kpis.minSatO2.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.minSatO2.timestamp)}` : '';
            const maxFrTooltip = kpis.maxFR.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.maxFR.timestamp)}` : '';
            const maxNews2Tooltip = kpis.maxNEWS2.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.maxNEWS2.timestamp)}` : '';
            const maxFugulinTooltip = kpis.maxFugulin.timestamp ? `Ocorrido em: ${formatTooltipDate(kpis.maxFugulin.timestamp)}` : '';

            const avgFcTooltip = `Calculado a partir de ${kpis.avgFC.count} registros`;
            const avgPasTooltip = `Calculado a partir de ${kpis.avgPAS.count} registros`;

            const hypoglycemiaTooltip = kpis.hypoglycemiaEpisodes.count > 0 ? 'Ocorrências:\n' + kpis.hypoglycemiaEpisodes.timestamps.map(ts => formatTooltipDate(ts)).join('\n') : '';
            const feverTooltip = kpis.feverEpisodes.count > 0 ? 'Ocorrências:\n' + kpis.feverEpisodes.timestamps.map(ts => formatTooltipDate(ts)).join('\n') : '';
            const sosMedTooltip = kpis.sosMedCount.count > 0 ? 'Ocorrências:\n' + kpis.sosMedCount.timestamps.map(ts => formatTooltipDate(ts)).join('\n') : '';

            // Gera o HTML para todos os cards, passando os dados e os tooltips
            kpiPanel.innerHTML = [
                createKpiCard('❤️', 'Pico de FC', kpis.maxFC.value, 'bpm', maxFcTooltip),
                createKpiCard('🩸', 'Menor PAS', kpis.minPAS.value, 'mmHg', minPasTooltip),
                createKpiCard('🌡️', 'Pico Febril', kpis.maxTemp.value, '°C', maxTempTooltip),
                createKpiCard('💨', 'Menor SatO₂', kpis.minSatO2.value, '%', minSatO2Tooltip),
                createKpiCard('🫁', 'Pico de FR', kpis.maxFR.value, 'irpm', maxFrTooltip),
                createKpiCard('📈', 'Maior NEWS', kpis.maxNEWS2.value, '', maxNews2Tooltip),
                createKpiCard('🩺', 'Maior Fugulin', kpis.maxFugulin.value, '', maxFugulinTooltip),
                createKpiCard('📉', 'Hipoglicemias', kpis.hypoglycemiaEpisodes.count, 'eventos', hypoglycemiaTooltip),
                createKpiCard('🔥', 'Episódios de Febre', kpis.feverEpisodes.count, 'eventos', feverTooltip),
                createKpiCard('💊', 'Medicações SOS', kpis.sosMedCount.count, 'doses', sosMedTooltip),
                createKpiCard('❤️', 'Média FC', kpis.avgFC.value, 'bpm', avgFcTooltip),
                createKpiCard('🩸', 'Média PAS', kpis.avgPAS.value, 'mmHg', avgPasTooltip)
            ].join('');
        }

        /**
         * Função Mestra: Busca todos os dados relevantes da unidade (pacientes e handovers dos últimos 7 dias),
         * processa e agrega tudo em um único objeto de resumo para ser usado pelas funções de renderização.
         * VERSÃO CORRIGIDA: Calcula as médias diárias com base em TODOS os pacientes ativos em cada dia.
         */
        async function generateUnitSummaryData() {
            try {
                // --- 1. BUSCA DE DADOS BRUTOS ---
                const activePatients = currentPatientList;
                
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);
                const patientsRef = collection(db, 'patients');

                const archivedPatientsQuery = query(patientsRef, where('status', '==', 'arquivado'), where('archivedAt', '>=', sevenDaysAgoTimestamp));
                const archivedSnapshot = await getDocs(archivedPatientsQuery);
                const archivedPatientsLast7Days = archivedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                const allRelevantPatients = [...activePatients, ...archivedPatientsLast7Days.filter(ap => !activePatients.some(p => p.id === ap.id))];

                if (allRelevantPatients.length === 0) {
                    return { isEmpty: true };
                }
                
                const admissionsInWeek = allRelevantPatients.filter(p => p.createdAt && p.createdAt.toDate() >= sevenDaysAgo).length;
                const dischargesInWeek = archivedPatientsLast7Days.length;

                const allHandoversLast7Days = [];
                for (const patient of allRelevantPatients) {
                    const handoversRef = collection(db, 'patients', patient.id, 'handovers');
                    const handoversQuery = query(handoversRef, where('timestamp', '>=', sevenDaysAgoTimestamp), orderBy('timestamp', 'desc'));
                    const handoversSnapshot = await getDocs(handoversQuery);
                    handoversSnapshot.docs.forEach(doc => {
                        allHandoversLast7Days.push({ patientId: patient.id, ...doc.data() });
                    });
                }

                // --- 2. CÁLCULO DOS KPIs ---
                const averageFugulin = activePatients.reduce((acc, p) => { 
                    if (p.lastFugulinScore) {
                        acc.sum += p.lastFugulinScore;
                        acc.count++;
                    }
                    return acc;
                }, { sum: 0, count: 0 });
                
                const kpis = {
                    activePatients: activePatients.length,
                    averageFugulin: averageFugulin.count > 0 ? (averageFugulin.sum / averageFugulin.count).toFixed(1) : 'N/A',
                    highRiskPatients: activePatients.filter(p => p.lastNews2Score >= 5).length, 
                    admissionsInWeek: admissionsInWeek,
                    dischargesInWeek: dischargesInWeek
                };

                // --- 3. PREPARAÇÃO DOS DADOS PARA OS GRÁFICOS ---
                
                // Gráficos de Pizza (Fugulin) e Barras (Medicações)
                const fugulinCounts = activePatients.reduce((acc, p) => {
                    const classification = p.lastFugulinClassification || 'Não Classificado';
                    acc[classification] = (acc[classification] || 0) + 1;
                    return acc;
                }, {});
                const sortedFugulinLabels = FUGULIN_CLASSIFICATION_ORDER.filter(label => fugulinCounts[label] !== undefined);
                const fugulinChartData = {
                    labels: sortedFugulinLabels,
                    data: sortedFugulinLabels.map(label => fugulinCounts[label])
                };

                const medicationCounts = allHandoversLast7Days.reduce((acc, h) => {
                    if (h.medicationsAdministered) {
                        h.medicationsAdministered.forEach(med => {
                            acc[med.name] = (acc[med.name] || 0) + 1; // Cada item é uma dose
                        });
                    }
                    return acc;
                }, {});
                const top5Medications = Object.entries(medicationCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
                const medicationChartData = {
                    labels: top5Medications.map(item => item[0].length > 25 ? item[0].substring(0, 22) + '...' : item[0]),
                    fullLabels: top5Medications.map(item => item[0]),
                    data: top5Medications.map(item => item[1])
                };
                
                // --- GRÁFICOS DE TENDÊNCIA E FLUXO ---
                
                // Pré-processa os handovers para busca rápida
                const handoversByPatient = allHandoversLast7Days.reduce((acc, h) => {
                    if (!acc[h.patientId]) acc[h.patientId] = [];
                    acc[h.patientId].push(h);
                    return acc;
                }, {});

                const dailyMetrics = {};
                for (let i = 6; i >= 0; i--) {
                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() - i);
                    const key = targetDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    targetDate.setHours(23, 59, 59, 999); // Final do dia para comparação

                    let fugulinSum = 0, fugulinCount = 0, newsSum = 0, newsCount = 0;

                    // Itera sobre todos os pacientes relevantes
                    for (const patient of allRelevantPatients) {
                        const createdAt = patient.createdAt.toDate();
                        const archivedAt = patient.archivedAt ? patient.archivedAt.toDate() : null;

                        // Verifica se o paciente estava ativo no dia em questão
                        const wasActiveOnTargetDay = createdAt <= targetDate && (!archivedAt || archivedAt > targetDate);

                        if (wasActiveOnTargetDay) {
                            // Encontra o último handover do paciente ATÉ aquele dia
                            const patientHandovers = handoversByPatient[patient.id] || [];
                            const lastHandoverUpToDate = patientHandovers.find(h => h.timestamp.toDate() <= targetDate);
                            
                            // Se encontrou um handover, usa os scores dele.
                            // Se não, o paciente estava ativo mas sem registro de score nesse período.
                            if (lastHandoverUpToDate) {
                                if (lastHandoverUpToDate.fugulin?.score) {
                                    fugulinSum += lastHandoverUpToDate.fugulin.score;
                                    fugulinCount++;
                                }
                                // CORREÇÃO: Verifica se o score é um número, incluindo o zero.
                                if (typeof lastHandoverUpToDate.news2?.score === 'number') {
                                    newsSum += lastHandoverUpToDate.news2.score;
                                    newsCount++;
                                }
                            }
                        }
                    }

                    dailyMetrics[key] = {
                        fugulinAvg: fugulinCount > 0 ? (fugulinSum / fugulinCount) : null,
                        newsAvg: newsCount > 0 ? (newsSum / newsCount) : null,
                        admissions: 0,
                        discharges: 0
                    };
                }

                // Preenche os dados de admissão e alta no objeto já criado
                allRelevantPatients.forEach(p => { 
                    if (p.createdAt && p.createdAt.toDate() >= sevenDaysAgo) {
                        const key = p.createdAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        if(dailyMetrics[key]) dailyMetrics[key].admissions++;
                    }
                });
                
                archivedSnapshot.docs.forEach(doc => {
                    const p = doc.data();
                    if (p.archivedAt) {
                        const key = p.archivedAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        if(dailyMetrics[key]) dailyMetrics[key].discharges++;
                    }
                });
                
                const trendsChartData = {
                    labels: Object.keys(dailyMetrics),
                    fugulinData: Object.values(dailyMetrics).map(d => d.fugulinAvg),
                    newsData: Object.values(dailyMetrics).map(d => d.newsAvg)
                };
                
                const flowChartData = {
                    labels: Object.keys(dailyMetrics),
                    admissionsData: Object.values(dailyMetrics).map(d => d.admissions),
                    dischargesData: Object.values(dailyMetrics).map(d => d.discharges)
                };


                // --- 4. PREPARAÇÃO DOS DADOS PARA AS TABELAS ---
                const highRiskPatients = activePatients
                    .filter(p => p.lastNews2Score >= 5)
                    .sort((a, b) => (b.lastNews2Score || 0) - (a.lastNews2Score || 0))
                    .slice(0, 5)
                    .map(p => {
                        // Busca todos os handovers do paciente na lista já carregada da semana e ordena do mais novo para o mais antigo.
                        const patientHandovers = allHandoversLast7Days
                            .filter(h => h.patientId === p.id)
                            .sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
                        
                        let trend = '―'; // Padrão: estável ou sem dados para comparar

                        // Garante que temos pelo menos dois registros para comparar
                        if (patientHandovers.length > 1) {
                            // Pega os scores dos dois plantões mais recentes
                            const latestScore = patientHandovers[0].news2?.score;
                            const previousScore = patientHandovers[1].news2?.score;

                            // Compara os scores somente se ambos existirem e forem números
                            if (typeof latestScore === 'number' && typeof previousScore === 'number') {
                                if (latestScore > previousScore) {
                                    trend = '↑'; // Piorou
                                } else if (latestScore < previousScore) {
                                    trend = '↓'; // Melhorou
                                }
                            }
                        }
                        // O score exibido é sempre o mais recente do objeto do paciente, que está atualizado.
                        return { bed: p.roomNumber, name: p.name, score: p.lastNews2Score, trend: trend, professional: p.lastProfessionalName || 'N/A' };
                    });

                const diagnosisCounts = activePatients.reduce((acc, p) => {
                    if (p.activeDiagnoses) {
                        p.activeDiagnoses.forEach(diag => { acc[diag] = (acc[diag] || 0) + 1; });
                    }
                    return acc;
                }, {});
                const diagnosisFrequency = Object.entries(diagnosisCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([diag, count]) => ({ diagnosis: diag, count: count, percentage: ((count / activePatients.length) * 100).toFixed(1) }));

                // --- 5. RETORNO DO OBJETO DE RESUMO COMPLETO ---
                return {
                    kpis, fugulinChartData, medicationChartData, trendsChartData,
                    flowChartData, highRiskPatients, diagnosisFrequency
                };

            } catch (error) {
                console.error("Erro ao gerar resumo da unidade:", error);
                showToast("Falha ao carregar os dados da unidade.", "error");
                return null;
            }
        }

        /**
         * Renderiza os cards de KPI (Indicadores Chave de Performance) no modal de resumo da unidade.
         * @param {object} kpis - O objeto contendo os dados dos KPIs.
         */
        function renderUnitKPIs(kpis) {
            const kpiPanel = document.getElementById('unit-kpi-panel');
            if (!kpiPanel) return;

            // Array com as definições de cada card para facilitar a renderização
            const kpiData = [
                {
                    label: 'Pacientes Ativos',
                    value: kpis.activePatients,
                    icon: '🛏️', // Ícone de cama
                    tooltip: 'Número total de pacientes com status "ativo" na unidade.'
                },
                {
                    label: 'Média de Complexidade',
                    value: kpis.averageFugulin,
                    icon: '🩺', // Ícone de estetoscópio
                    tooltip: 'Média do score Fugulin de todos os pacientes ativos. Indica a carga de trabalho da enfermagem.'
                },
                {
                    label: 'Pacientes em Alto Risco',
                    value: kpis.highRiskPatients,
                    icon: '⚠️', // Ícone de alerta
                    tooltip: 'Número de pacientes com score NEWS igual ou superior a 5.'
                },
                {
                    label: 'Admissões na Semana',
                    value: kpis.admissionsInWeek,
                    icon: '➡️', // Ícone de seta entrando
                    tooltip: 'Total de novos pacientes cadastrados nos últimos 7 dias.'
                },
                {
                    label: 'Saídas na Semana',
                    value: kpis.dischargesInWeek,
                    icon: '⬅️', // Ícone de seta saindo
                    tooltip: 'Total de pacientes arquivados (considerados como saída) nos últimos 7 dias.'
                }
            ];

            // Gera o HTML para cada card e insere no painel
            kpiPanel.innerHTML = kpiData.map(kpi => `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center shadow-sm" title="${kpi.tooltip}">
                    <p class="text-sm text-gray-600 font-medium flex items-center justify-center">
                        <span class="text-xl mr-2">${kpi.icon}</span>
                        ${kpi.label}
                    </p>
                    <p class="text-4xl font-bold text-indigo-600 mt-2">
                        ${kpi.value}
                    </p>
                </div>
            `).join('');
        }

        /**
         * Renderiza o gráfico de pizza com a distribuição de pacientes por classificação Fugulin.
         */
        function renderFugulinChart(chartData) {
            const ctx = document.getElementById('fugulin-distribution-chart')?.getContext('2d');
            if (!ctx) return;

            if (fugulinChart) {
                fugulinChart.destroy();
            }
            
            // Cria arrays de cores dinâmicos baseados nas legendas (labels) recebidas.
            const dynamicBackgroundColors = chartData.labels.map(
                label => FUGULIN_CHART_COLORS[label] || '#e5e7eb' // Usa a cor do mapa ou um cinza padrão
            );
            const dynamicBorderColors = chartData.labels.map(
                label => FUGULIN_CHART_BORDERS[label] || '#9ca3af' // Usa a cor da borda do mapa ou um cinza padrão
            );

            fugulinChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Nº de Pacientes',
                        data: chartData.data,
                        backgroundColor: dynamicBackgroundColors, // <-- Usa o array de cores dinâmico
                        borderColor: dynamicBorderColors,         // <-- Usa o array de bordas dinâmico
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        }
                    }
                }
            });
        }

        /**
         * Renderiza o gráfico de barras com as medicações mais utilizadas na semana.
         */
        function renderMedicationChart(chartData) {
            const ctx = document.getElementById('medication-chart')?.getContext('2d');
            if (!ctx) return;

            if (medicationChart) {
                medicationChart.destroy();
            }

            medicationChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Doses Administradas',
                        data: chartData.data,
                        backgroundColor: 'rgba(79, 70, 229, 0.6)', // indigo-600 com opacidade
                        borderColor: 'rgba(79, 70, 229, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y', // Transforma em gráfico de barras horizontais
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false // Não precisa de legenda para um único dataset
                        },
                        tooltip: {
                            callbacks: {
                                // Esta função é chamada para gerar o título do tooltip
                                title: function(tooltipItems) {
                                    // Pega o índice do item sobre o qual o mouse está
                                    const index = tooltipItems[0].dataIndex;
                                    // Usa o índice para buscar o nome completo no array 'fullLabels'
                                    return chartData.fullLabels[index];
                                },
                                // Esta função é chamada para gerar o corpo do tooltip
                                label: function(tooltipItem) {
                                    // Retorna a contagem de doses normalmente
                                    return ` Doses: ${tooltipItem.raw}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            title: { display: true, text: 'Doses Administradas' },
                            ticks: {
                                precision: 0 // Garante que não hajam casas decimais
                            }
                        }
                    }
                }
            });
        }

        /**
         * Renderiza o gráfico de linha com as tendências de scores Fugulin vs. NEWS2.
         */
        function renderTrendsChartUnit(chartData) {
            const ctx = document.getElementById('trends-chart-unit')?.getContext('2d');
            if (!ctx) return;

            if (unitTrendsChart) {
                unitTrendsChart.destroy();
            }

            unitTrendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [
                        {
                            label: 'Média Fugulin',
                            data: chartData.fugulinData,
                            borderColor: 'rgb(59, 130, 246)', // blue-500
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            yAxisID: 'yFugulin',
                            tension: 0.1,
                            spanGaps: true
                        },
                        {
                            label: 'Média NEWS',
                            data: chartData.newsData,
                            borderColor: 'rgb(239, 68, 68)', // red-500
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            yAxisID: 'yNews',
                            tension: 0.1,
                            spanGaps: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        yFugulin: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Score Fugulin' }
                        },
                        yNews: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: 'Score NEWS' },
                            grid: { drawOnChartArea: false } // Não desenha a grade para o segundo eixo
                        }
                    }
                }
            });
        }

        /**
         * Renderiza a tabela com o Top 5 pacientes com maior risco de deterioração (NEWS2 >= 5).
         * @param {Array<object>} highRiskPatients - Array de objetos de pacientes de alto risco.
         */
        function renderHighRiskTable(highRiskPatients) {
            const tableBody = document.getElementById('high-risk-table-body');
            if (!tableBody) return;

            if (!highRiskPatients || highRiskPatients.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500 italic">Nenhum paciente com risco elevado (NEWS ≥ 5) no momento.</td></tr>`;
                return;
            }

            tableBody.innerHTML = highRiskPatients.map(p => {
                let trendHtml = '';
                if (p.trend === '↑') {
                    trendHtml = `<span class="text-red-600 font-bold" title="Score Aumentou">${p.trend}</span>`;
                } else if (p.trend === '↓') {
                    trendHtml = `<span class="text-green-600 font-bold" title="Score Diminuiu">${p.trend}</span>`;
                } else {
                    trendHtml = `<span class="text-gray-500" title="Score Estável">${p.trend}</span>`;
                }

                return `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 font-mono text-center">${p.bed}</td>
                        <td class="p-2">${p.name}</td>
                        <td class="p-2 font-bold text-center">${p.score}</td>
                        <td class="p-2 text-xl text-center">${trendHtml}</td>
                        <td class="p-2 text-gray-600 truncate" title="${p.professional}">${p.professional}</td>
                    </tr>
                `;
            }).join('');
        }

        /**
         * Renderiza a tabela com os diagnósticos mais frequentes na unidade.
         * @param {Array<object>} diagnosisFrequency - Array de objetos com diagnósticos e suas contagens.
         */
        function renderDiagnosisTable(diagnosisFrequency) {
            const tableBody = document.getElementById('diagnosis-frequency-table-body');
            if (!tableBody) return;

            if (!diagnosisFrequency || diagnosisFrequency.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-500 italic">Nenhum diagnóstico registrado entre os pacientes ativos.</td></tr>`;
                return;
            }

            tableBody.innerHTML = diagnosisFrequency.map(d => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-2">${d.diagnosis}</td>
                    <td class="p-2 text-center">${d.count}</td>
                    <td class="p-2 text-center">${d.percentage}%</td>
                </tr>
            `).join('');
        }

        /**
         * Renderiza o gráfico de barras agrupadas com Admissões vs. Saídas.
         */
        function renderFlowChart(chartData) {
            const ctx = document.getElementById('flow-chart-unit')?.getContext('2d');
            if (!ctx) return;

            if (unitFlowChart) {
                unitFlowChart.destroy();
            }
            
            unitFlowChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [
                        {
                            label: 'Admissões',
                            data: chartData.admissionsData,
                            backgroundColor: 'rgba(22, 163, 74, 0.6)', // green-600
                        },
                        {
                            label: 'Saídas',
                            data: chartData.dischargesData,
                            backgroundColor: 'rgba(220, 38, 38, 0.6)', // red-600
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Nº de Pacientes' },
                            ticks: {
                                precision: 0 // Garante que não hajam casas decimais
                            }
                        }
                    }
                }
            });
        }


        /**
         * Gera um HTML formatado para o resumo da unidade, converte os gráficos em imagens
         * e aciona a impressão do navegador, seguindo o modelo da impressão do resumo do paciente.
         */
        async function handlePrintUnitSummary() {
            const printView = document.getElementById('print-view');
            if (!currentUnitSummaryData || !fugulinChart || !unitTrendsChart || !medicationChart || !unitFlowChart) {
                showToast("Dados do resumo da unidade não estão prontos para impressão.", "error");
                return;
            }
            
            showToast("Preparando impressão...", 2000);

            const { kpis, highRiskPatients, diagnosisFrequency, medicationChartData } = currentUnitSummaryData;

            const fugulinChartImg = fugulinChart.toBase64Image();
            const medicationChartImg = medicationChart.toBase64Image();
            const trendsChartImg = unitTrendsChart.toBase64Image();
            const flowChartImg = unitFlowChart.toBase64Image();


            let topMedicationsHtml = '<tr><td colspan="2" style="text-align: center; padding: 10px; border: 1px solid #ddd;">Nenhuma medicação administrada.</td></tr>';
            if (medicationChartData && medicationChartData.data.length > 0) {
                topMedicationsHtml = medicationChartData.labels.map((label, index) => `
                    <tr style="page-break-inside: avoid;">
                        <td style="border: 1px solid #ddd; padding: 4px;">${medicationChartData.fullLabels[index]}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center;">${medicationChartData.data[index]}</td>
                    </tr>
                `).join('');
            }

            printView.innerHTML = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                        <h1 style="font-size: 24px; margin: 0;">Resumo Geral da Unidade</h1>
                        <p style="font-size: 12px; margin: 5px 0;">Relatório gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                    </div>

                    <div style="margin-bottom: 20px; page-break-inside: avoid;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Visão Geral da Unidade</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: center;">
                            <tbody>
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Pacientes Ativos:</strong><br><span style="font-size: 24px; font-weight: bold;">${kpis.activePatients}</span></td>
                                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Média de Complexidade (Fugulin):</strong><br><span style="font-size: 24px; font-weight: bold;">${kpis.averageFugulin}</span></td>
                                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Pacientes em Alto Risco (NEWS≥5):</strong><br><span style="font-size: 24px; font-weight: bold;">${kpis.highRiskPatients}</span></td>
                                </tr>
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 8px;" colspan="2"><strong>Admissões (Últimos 7 dias):</strong><br><span style="font-size: 24px; font-weight: bold;">${kpis.admissionsInWeek}</span></td>
                                    <td style="border: 1px solid #ddd; padding: 8px;" colspan="1"><strong>Saídas (Últimos 7 dias):</strong><br><span style="font-size: 24px; font-weight: bold;">${kpis.dischargesInWeek}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; gap: 20px; margin-top: 20px; page-break-inside: avoid;">
                        <div style="width: 48%; text-align: center;">
                            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Distribuição por Complexidade</h3>
                            <img src="${fugulinChartImg}" style="width: 100%; max-width: 350px; border: 1px solid #eee; margin: 0 auto;" alt="Gráfico Fugulin"/>
                        </div>
                        <div style="width: 48%; text-align: center;">
                            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">5 Principais Medicações</h3>
                            <img src="${medicationChartImg}" style="width: 100%; max-width: 350px; border: 1px solid #eee; margin: 0 auto;" alt="Gráfico de Medicações"/>
                        </div>
                    </div>

                    <div style="margin-top: 25px; page-break-before: auto;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Medicações Mais Utilizadas (Últimos 7 dias)</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead style="background-color: #f2f2f2; text-align: left;">
                                <tr>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Medicação</th>
                                    <th style="border: 1px solid #ddd; padding: 5px; text-align: center;">Doses Administradas</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${topMedicationsHtml}
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top: 25px; page-break-before: auto;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Pacientes com Maior Risco de Deterioração</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead style="background-color: #f2f2f2; text-align: left;">
                                <tr>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Leito</th>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Paciente</th>
                                    <th style="border: 1px solid #ddd; padding: 5px; text-align: center;">NEWS2</th>
                                    <th style="border: 1px solid #ddd; padding: 5px; text-align: center;">Tend.</th>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Último Profissional</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${highRiskPatients.length > 0 ? highRiskPatients.map(p => `
                                    <tr style="page-break-inside: avoid;">
                                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center;">${p.bed}</td>
                                        <td style="border: 1px solid #ddd; padding: 4px;">${p.name}</td>
                                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; font-weight: bold;">${p.score}</td>
                                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; font-size: 14px;">${p.trend}</td>
                                        <td style="border: 1px solid #ddd; padding: 4px;">${p.professional}</td>
                                    </tr>`).join('') : '<tr><td colspan="5" style="text-align: center; padding: 10px; border: 1px solid #ddd;">Nenhum paciente com risco elevado.</td></tr>'}
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-top: 25px; page-break-before: auto;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Diagnósticos Mais Frequentes</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead style="background-color: #f2f2f2; text-align: left;">
                                <tr>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Diagnóstico</th>
                                    <th style="border: 1px solid #ddd; padding: 5px; text-align: center;">Nº Pac.</th>
                                    <th style="border: 1px solid #ddd; padding: 5px; text-align: center;">% Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${diagnosisFrequency.length > 0 ? diagnosisFrequency.map(d => `
                                    <tr style="page-break-inside: avoid;">
                                        <td style="border: 1px solid #ddd; padding: 4px;">${d.diagnosis}</td>
                                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center;">${d.count}</td>
                                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center;">${d.percentage}%</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="3" style="text-align: center; padding: 10px; border: 1px solid #ddd;">Nenhum diagnóstico registrado.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            setTimeout(() => window.print(), 300);
        }

        /**
         * Rola a página suavemente até um módulo específico, especialmente em telas menores.
         * @param {HTMLElement} moduleElement - O elemento do card do módulo para o qual rolar.
         */
        function scrollToModule(moduleElement) {
            // Adiciona um pequeno atraso para garantir que o DOM foi atualizado com a expansão do módulo
            setTimeout(() => {
                // A opção 'block: nearest' é inteligente:
                // - Se o módulo já estiver visível, não faz nada.
                // - Se estiver parcialmente visível, rola o mínimo necessário para exibi-lo por completo.
                moduleElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 150); // Atraso de 150ms para dar tempo ao navegador de renderizar a expansão.
        }

        /**
         * Orquestra a exibição do modal de resumo da unidade, buscando os dados e renderizando os componentes.
         */
        async function showUnitSummary() {
            const modal = document.getElementById('unit-summary-modal');
            const loader = document.getElementById('unit-summary-loader');
            const contentContainer = document.getElementById('unit-summary-main-container');

            // 1. Prepara a UI para carregamento
            modal.classList.remove('hidden');
            loader.style.display = 'block';
            loader.innerHTML = `
                <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p class="mt-3 text-gray-600">Analisando dados da unidade...</p>`;
            contentContainer.classList.add('hidden');
            
            // 2. Chama a função que busca e processa todos os dados.
            const summaryData = await generateUnitSummaryData();

            currentUnitSummaryData = summaryData; // Guarda os dados para a impressão

            // 3. Verifica se os dados foram retornados e renderiza o conteúdo
            if (summaryData) {
                if (summaryData.isEmpty) {
                    loader.innerHTML = '<p class="text-gray-600 p-10">Não há pacientes ativos na unidade para gerar um resumo.</p>';
                } else {
                    // Renderiza os KPIs (Passo 3)
                    renderUnitKPIs(summaryData.kpis);
                    
                    // Renderiza os Gráficos (Passo 4)
                    renderFugulinChart(summaryData.fugulinChartData);
                    renderMedicationChart(summaryData.medicationChartData);
                    renderTrendsChartUnit(summaryData.trendsChartData);
                    renderFlowChart(summaryData.flowChartData);
                    
                    // **AQUI ESTÁ A MÁGICA DO PASSO 5**
                    // Renderiza as Tabelas
                    renderHighRiskTable(summaryData.highRiskPatients);
                    renderDiagnosisTable(summaryData.diagnosisFrequency);

                    // Esconde o loader e mostra o conteúdo principal
                    loader.style.display = 'none';
                    contentContainer.classList.remove('hidden');
                }
            } else {
                // Exibe uma mensagem de erro se a busca falhar
                loader.innerHTML = '<p class="text-red-600 p-10">Ocorreu um erro ao buscar os dados. Tente novamente.</p>';
            }
        }

        /**
         * Formata um valor numérico de dose (em mg) para uma string com unidade (mg ou g).
         * @param {number | string} doseInMg - A dose em miligramas.
         * @returns {string} - A dose formatada (ex: "500mg", "1g", "1.5g").
         */
        function formatDose(doseInMg) {
            const dose = parseFloat(doseInMg);
            if (isNaN(dose)) {
                return doseInMg; // Retorna o valor original se não for um número (ex: "1 cp")
            }
            if (dose >= 1000) {
                const grams = dose / 1000;
                // Formata para o padrão brasileiro e remove zeros desnecessários no final
                return `${grams.toLocaleString('pt-BR', { maximumFractionDigits: 3 }).replace(/\.?0+$/, '')}g`;
            }
            return `${dose}mg`;
        }

        /**
         * Orquestra a exibição do modal de medicações da unidade, buscando os dados e renderizando.
         */
        async function showUnitMedicationsPanel() {
            unitMedicationsModal.classList.remove('hidden');
            unitMedicationsContent.innerHTML = '<p class="text-center text-gray-500">Carregando medicações...</p>';

            try {
                const medications = await getUpcomingAndOverdueMedications();

                // Ordena: atrasadas primeiro, depois as mais próximas
                medications.sort((a, b) => a.time.getTime() - b.time.getTime());

                if (medications.length === 0) {
                    unitMedicationsContent.innerHTML = '<p class="text-center text-gray-500 italic">Nenhuma medicação agendada na unidade.</p>';
                    return;
                }

                // Agrupa as medicações por paciente
                const medsByPatient = medications.reduce((acc, med) => {
                    if (!acc[med.patientId]) {
                        acc[med.patientId] = {
                            patientName: med.patientName,
                            roomNumber: med.roomNumber,
                            patientNumber: med.patientNumber,
                            meds: []
                        };
                    }
                    acc[med.patientId].meds.push(med);
                    return acc;
                }, {});

                unitMedicationsContent.innerHTML = '';
                const now = new Date();

                for (const patientId in medsByPatient) {
                    const patientData = medsByPatient[patientId];
                    const hasOverdue = patientData.meds.some(m => m.time < now);

                    const card = document.createElement('div');
                    card.className = `medication-patient-card ${hasOverdue ? 'is-overdue' : ''}`;

                    let medsHtml = patientData.meds.map(med => {
                        const isOverdue = med.time < now;
                        const timeString = med.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        return `
                            <li class="medication-item ${isOverdue ? 'is-overdue' : ''}">
                                <span class="medication-time font-mono">${timeString}</span> - <strong>${med.medicationName} ${med.dose}</strong>
                            </li>
                        `;
                    }).join('');

                    card.innerHTML = `
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-bold text-gray-800">${patientData.patientName}</h4>
                            <p class="text-sm text-gray-600">Leito: ${patientData.roomNumber} | Pront.: ${patientData.patientNumber}</p>
                        </div>
                        <ul class="list-disc pl-5 space-y-1">
                            ${medsHtml}
                        </ul>
                    `;
                    unitMedicationsContent.appendChild(card);
                }

            } catch (error) {
                console.error("Erro ao mostrar painel de medicações:", error);
                unitMedicationsContent.innerHTML = '<p class="text-center text-red-500">Falha ao carregar as medicações.</p>';
            }
        }

        // --- FUNÇÕES DE NAVEGAÇÃO E UI ---~

        /**
         * Atualiza o indicador visual (bolinha vermelha) no ícone do sino.
         * @param {number} unreadCount - O número de notificações não lidas.
         */
        function updateBellIndicator(unreadCount) {
            if (unreadCount > 0) {
                notificationIndicator.classList.remove('hidden');
            } else {
                notificationIndicator.classList.add('hidden');
            }
        }

        /**
         * Renderiza a lista de notificações no painel dropdown.
         */
        function renderNotificationsPanel() {
            notificationList.innerHTML = ''; // Limpa a lista

            if (allNotifications.length === 0) {
                notificationList.innerHTML = '<p class="p-4 text-sm text-center text-gray-500">Nenhuma notificação encontrada.</p>';
                return;
            }

            allNotifications.slice(0, 20).forEach(notif => { // Mostra as últimas 20
                const item = document.createElement('div');
                item.className = `notification-item ${!notif.read ? 'unread' : ''}`;
                item.dataset.notifId = notif.id;
                item.dataset.patientId = notif.patientId;
                item.dataset.handoverId = notif.handoverId;

                const date = notif.timestamp?.toDate ? notif.timestamp.toDate() : new Date();
                const formattedDate = date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

                item.innerHTML = `
                    <p class="text-sm text-gray-800">
                        <strong>${notif.actorName}</strong> adicionou um adendo na passagem de <strong>${notif.patientName}</strong>.
                    </p>
                    <p class="text-xs text-gray-500 mt-1">${formattedDate}</p>
                `;
                notificationList.appendChild(item);
            });
        }

        /**
         * FUNÇÃO DE PROCESSAMENTO
         * Itera sobre os plantões e extrai uma lista cronológica de eventos relevantes.
         * @param {Array} handovers - Array de objetos de handover, em ordem decrescente (mais novo primeiro).
         * @returns {Array} - Um array de objetos de evento, prontos para serem renderizados.
         */
        function processEventsForTable(handovers) {
            const events = [];
            const sosMeds = ['acetilsalicilico', 'bromoprida', 'codeina', 'diazepam', 'dipirona', 'haloperidol', 'ibuprofeno', 'metoclopramida', 'midazolam', 'morfina', 'ondansetrona', 'paracetamol', 'tramadol', 'epinefrina', 'norepinefrina', 'dobutamina'];

            handovers.forEach((h, index) => {
                const timestamp = h.timestamp?.toDate ? h.timestamp.toDate() : new Date();
                const professional = h.professionalName || 'N/A';

                // Alertas Clínicos
                if (h.news2?.score >= 5) {
                    const previousHandover = handovers[index + 1];
                    const previousScore = previousHandover?.news2?.score ?? 0;
                    if (h.news2.score > previousScore || !previousHandover) {
                        events.push({
                            timestamp,
                            category: '⚠️ Alerta Clínico',
                            description: `Aumento do Score NEWS para: <strong>${h.news2.score}</strong> (anterior: ${previousHandover ? previousScore : 'N/A'})`,
                            professional
                        });
                    }
                }
                if (h.monitoring?.temp) {
                    const temp = parseFloat(h.monitoring.temp.replace(',', '.'));
                    if (temp > 37.8) {
                        events.push({
                            timestamp,
                            category: '⚠️ Alerta Clínico',
                            description: `Pico Febril: <strong>${temp.toFixed(1)}°C</strong>`,
                            professional
                        });
                    }
                }
                
                // Medicações SOS Administradas
                if (h.medicationsAdministered && Array.isArray(h.medicationsAdministered)) {
                    const sosAdministered = h.medicationsAdministered.filter(med => {
                        const medNameLower = (med.name || '').toLowerCase();
                        return sosMeds.some(sosMed => medNameLower.includes(sosMed));
                    });
                    if (sosAdministered.length > 0) {
                        const description = sosAdministered.map(med => `<strong>${med.name} ${formatDose(med.dose)}</strong>`).join(', ');
                        events.push({
                            timestamp,
                            category: '💉 Medicação SOS',
                            description: `Administrado: ${description}`,
                            professional
                        });
                    }
                }

                // Novas Prescrições
                const medChanges = h.changes?.medications;
                if (medChanges) {
                    if (medChanges.added?.length > 0) {
                        medChanges.added.forEach(med => {
                            events.push({
                                timestamp,
                                category: '💊 Prescrição',
                                description: `Iniciado ${formatPrescriptionForHistory(med)}`,
                                professional
                            });
                        });
                    }
                    if (medChanges.modified?.length > 0) {
                        medChanges.modified.forEach(mod => {
                            const before = mod.before;
                            const after = mod.after;
                            let changeDesc = `Modificado <strong>${after.name} ${formatDose(after.dose)}</strong>.`;
                            if (before.frequency !== after.frequency) {
                                changeDesc += ` Frequência alterada de ${before.frequency}h para ${after.frequency}h.`;
                            }
                            if (before.duration !== after.duration) {
                                changeDesc += ` Duração alterada de ${before.duration} dias para ${after.duration} dias.`;
                            }
                            events.push({
                                timestamp,
                                category: '💊 Prescrição',
                                description: changeDesc,
                                professional
                            });
                        });
                    }
                    if (medChanges.suspended?.length > 0) {
                        medChanges.suspended.forEach(med => {
                            events.push({
                                timestamp,
                                category: '💊 Prescrição',
                                description: `Suspendido ${formatPrescriptionForHistory(med)}`,
                                professional
                            });
                        });
                    }
                }

                // Exames e Procedimentos
                if (h.examsDone && h.examsDone.length > 0) {
                    h.examsDone.forEach(exam => {
                        events.push({
                            timestamp,
                            category: '🧪 Resultado',
                            description: `Resultado de <strong>${exam.name}</strong>: "${(exam.result || '').substring(0, 50)}..."`,
                            professional
                        });
                    });
                }
                if (h.changes?.pendingExams?.added?.length > 0) {
                    h.changes.pendingExams.added.forEach(exam => {
                        events.push({
                            timestamp,
                            category: '🧪 Procedimento',
                            description: `Realizado <strong>${exam.name}</strong> (aguardando resultado)`,
                            professional
                        });
                    });
                }
                if (h.changes?.scheduledExams?.added?.length > 0) {
                    h.changes.scheduledExams.added.forEach(exam => {
                        events.push({
                            timestamp,
                            category: '📅 Agendamento',
                            description: `Agendado <strong>${exam.name}</strong>`,
                            professional
                        });
                    });
                }

                // Novos Diagnósticos
                if (h.changes?.diagnoses?.added?.length > 0) {
                    h.changes.diagnoses.added.forEach(diag => {
                        events.push({
                            timestamp,
                            category: '⚕️ Diagnóstico',
                            description: `Adicionado: <strong>${diag}</strong>`,
                            professional
                        });
                    });
                }
            });

            // Ordena os eventos por data, do mais recente para o mais antigo, para garantir a ordem correta na timeline
            return events.sort((a, b) => b.timestamp - a.timestamp);
        }


        /**
        * FUNÇÃO DE RENDERIZAÇÃO
        * Pega a lista de eventos e renderiza as linhas da tabela no DOM.
        * @param {Array} events - O array de eventos retornado por processEventsForTable.
        */
        function renderEventsTable(events) {
            const tableBody = document.getElementById('events-table-body');
            if (!tableBody) return;

            if (events.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-gray-500 p-4">
                            Nenhum evento relevante registrado na última semana.
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = events.map(event => {
                const formattedDate = event.timestamp.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }).replace(',','');

                return `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 text-sm text-gray-600 whitespace-nowrap">${formattedDate}</td>
                        <td class="p-2 text-sm text-gray-800 whitespace-nowrap">${event.category}</td>
                        <td class="p-2 text-sm text-gray-800">${event.description}</td>
                        <td class="p-2 text-sm text-gray-600 whitespace-nowrap">${event.professional}</td>
                    </tr>
                `;
            }).join('');
        }

        /**
         * FUNÇÃO DE PROCESSAMENTO
         * Prepara os dados do histórico para serem usados pela biblioteca Chart.js.
         * @param {Array} handovers - Array de objetos de handover em ordem CRONOLÓGICA (mais antigo primeiro).
         * @returns {object} - Um objeto contendo labels e datasets para o gráfico.
         */
        function prepareChartData(handovers) {
            const chartData = {
                labels: [],
                datasets: {
                    fc: [],
                    fr: [],
                    pas: [],
                    temp: [],
                    news2: []
                }
            };

            handovers.forEach(h => {
                const timestamp = h.timestamp?.toDate ? h.timestamp.toDate() : new Date();
                const label = timestamp.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                chartData.labels.push(label);

                const mon = h.monitoring;
                const score = h.news2;

                // Adiciona o valor se existir, ou null para criar uma falha no gráfico
                const fc = mon?.fc ? parseInt(mon.fc, 10) : null;
                chartData.datasets.fc.push(isNaN(fc) ? null : fc);

                const fr = mon?.fr ? parseInt(mon.fr, 10) : null;
                chartData.datasets.fr.push(isNaN(fr) ? null : fr);

                const pas = mon?.pa ? parseInt(mon.pa.split('/')[0], 10) : null;
                chartData.datasets.pas.push(isNaN(pas) ? null : pas);

                const temp = mon?.temp ? parseFloat(mon.temp.replace(',', '.')) : null;
                chartData.datasets.temp.push(isNaN(temp) ? null : temp);

                const news2Score = score?.score !== undefined ? score.score : null;
                chartData.datasets.news2.push(news2Score);
            });

            return chartData;
        }


        /**
        * PASSO 3 - FUNÇÃO DE RENDERIZAÇÃO
        * Renderiza o gráfico de tendências usando Chart.js.
        * @param {object} chartData - O objeto retornado por prepareChartData.
        */
        function renderTrendsChart(chartData) {
            const ctx = document.getElementById('trends-chart').getContext('2d');
            if (!ctx) return;

            // Destrói qualquer gráfico anterior para evitar sobreposição e vazamento de memória
            if (weeklySummaryChart) {
                weeklySummaryChart.destroy();
            }

            weeklySummaryChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [
                        {
                            label: 'FC (bpm)',
                            data: chartData.datasets.fc,
                            borderColor: 'rgb(239, 68, 68)', // red-500
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            yAxisID: 'y',
                            tension: 0, // ALTERADO: Tensão definida para 0 para linhas retas em dados ausentes
                            spanGaps: true 
                        },
                        {
                            label: 'PAS (mmHg)',
                            data: chartData.datasets.pas,
                            borderColor: 'rgb(59, 130, 246)', // blue-500
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            yAxisID: 'y',
                            tension: 0, // ALTERADO: Tensão definida para 0
                            spanGaps: true 
                        },
                        {
                            label: 'FR (irpm)',
                            data: chartData.datasets.fr,
                            borderColor: 'rgb(22, 163, 74)', // green-600
                            backgroundColor: 'rgba(22, 163, 74, 0.1)',
                            yAxisID: 'y',
                            tension: 0, // ALTERADO: Tensão definida para 0
                            spanGaps: true 
                        },
                        {
                            label: 'Temp (°C)',
                            data: chartData.datasets.temp,
                            borderColor: 'rgb(249, 115, 22)', // orange-500
                            backgroundColor: 'rgba(249, 115, 22, 0.1)',
                            yAxisID: 'y1', 
                            tension: 0, // ALTERADO: Tensão definida para 0
                            spanGaps: true 
                        },
                        {
                            label: 'Score NEWS',
                            data: chartData.datasets.news2,
                            borderColor: 'rgb(107, 114, 128)', // gray-500
                            backgroundColor: 'rgba(107, 114, 128, 0.1)',
                            stepped: true, 
                            yAxisID: 'y1', 
                            tension: 0, // ALTERADO: Tensão definida para 0 (embora stepped já ajude)
                            spanGaps: true 
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Data e Hora do Registro' }
                        },
                        y: { 
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'BPM / mmHg / IRPM' },
                            suggestedMin: 40 
                        },
                        y1: { 
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: '°C / Score' },
                            grid: {
                                drawOnChartArea: false, 
                            },
                        }
                    },
                    plugins: {
                        tooltip: {
                            titleFont: { weight: 'bold' },
                            bodyFont: { size: 12 },
                        }
                    }
                }
            });
        }

        /**
         * Lida com o clique em uma notificação: exibe um loader, marca como lida, 
         * navega para o paciente e abre o modal da passagem de plantão correspondente.
         * @param {string} notifId - O ID da notificação.
         * @param {string} patientId - O ID do paciente.
         * @param {string} handoverId - O ID do handover.
         */
        async function handleNotificationClick(notifId, patientId, handoverId) {
                console.log(`[handleNotificationClick] Clicou na notificação ID: ${notifId}`);
                notificationPanel.classList.add('hidden');
                
                showActionLoader();

                try {
                    const notifRef = doc(db, 'notifications', notifId);
                    await updateDoc(notifRef, { read: true });

                    // A função showPatientDetail continuará a carregar a lista completa em segundo plano
                    await showPatientDetail(patientId);
                    
                    // Em vez de procurar em 'currentHandovers', buscamos o documento exato.
                    console.log(`Buscando handover específico: patientId=${patientId}, handoverId=${handoverId}`);
                    const handoverRef = doc(db, 'patients', patientId, 'handovers', handoverId);
                    const handoverSnap = await getDoc(handoverRef);

                    if (handoverSnap.exists()) {
                        // onstruímos o objeto de dados a partir do documento que acabamos de buscar.
                        const handoverData = { id: handoverSnap.id, ...handoverSnap.data() };

                        populateHandoverViewModal(handoverData);
                        viewHandoverModal.classList.remove('hidden'); 
                        
                        const adendosSection = document.getElementById('view-handover-adendos-section');
                        if (adendosSection) {
                            adendosSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    } else {
                        // A mensagem de erro agora é mais precisa.
                        showToast("Não foi possível encontrar a passagem de plantão correspondente.", "error");
                        console.error(`Handover com ID ${handoverId} não foi encontrado no banco de dados.`);
                    }

                } catch (error) {
                    console.error("Erro ao processar clique na notificação:", error);
                    showToast("Ocorreu um erro ao abrir a notificação.", "error");
                } finally {
                    hideActionLoader();
                }
            }


        /**
         * Configura o listener em tempo real para as notificações do usuário logado.
         * @param {object} user - O objeto do usuário autenticado do Firebase.
         */
        function setupNotificationListener(user) {
            if (unsubscribeNotifications) {
                console.log("[setupNotificationListener] Cancelando listener de notificações anterior.");
                unsubscribeNotifications();
            }

            console.log(`[setupNotificationListener] Configurando listener para o usuário: ${user.uid}`);
            
            const q = query(collection(db, 'notifications'), where('recipientUid', '==', user.uid), orderBy('timestamp', 'desc'));

            unsubscribeNotifications = onSnapshot(q, (snapshot) => {
                const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`[onSnapshot] Recebidas ${notifications.length} notificações.`);

                allNotifications = notifications;
                const unreadCount = allNotifications.filter(n => !n.read).length;
                
                updateBellIndicator(unreadCount);
                renderNotificationsPanel();
                
            }, (error) => {
                console.error("Erro ao buscar notificações em tempo real:", error);
                showToast("Erro ao carregar notificações.", "error");
            });
        }

        /**
         * Atualiza o indicador visual com 3 estados de conexão.
         * @param {'online' | 'offline' | 'connecting'} status - O estado atual da conexão.
         */
        function updateConnectionStatus(status) {
            const statusEl = document.getElementById('connection-status');
            if (!statusEl) return;

            // A classe 'hidden' esconde por padrão (no celular)
            // A classe 'sm:inline' mostra a partir de telas pequenas (sm) para cima
            const textClasses = "hidden sm:inline text-sm font-medium text-gray-600";

            switch (status) {
                case 'online':
                    statusEl.innerHTML = `
                        <div class="status-dot status-online" title="Conexão estabelecida."></div>
                        <span class="${textClasses}">Online</span>
                    `;
                    break;
                case 'connecting':
                    statusEl.innerHTML = `
                        <div class="status-dot status-connecting" title="Conectando..."></div>
                        <span class="${textClasses}">Conectando...</span>
                    `;
                    break;
                case 'offline':
                    statusEl.innerHTML = `
                        <div class="status-dot status-offline" title="Você está offline."></div>
                        <span class="${textClasses}">Offline</span>
                    `;
                    break;
            }
        }

        /**
         * Controla a visibilidade da mensagem "Nenhuma alergia adicionada"
         * com base no estado do módulo de alergias e no modo de edição.
         */
        function updateAllergyPlaceholder() {
            const radioYes = document.getElementById('allergy-radio-yes');
            const tagsContainer = document.getElementById('allergies-tags-container');
            const placeholder = document.getElementById('allergy-placeholder-message');
            const inputWrapper = document.getElementById('allergy-input-wrapper');

            // Garante que todos os elementos existem antes de prosseguir
            if (!radioYes || !tagsContainer || !placeholder || !inputWrapper) return;

            // A condição para mostrar a mensagem agora é:
            // 1. O botão "Sim" está marcado E
            // 2. O container de tags está vazio E
            // 3. O campo de input de texto está ESCONDIDO.
            const shouldShow = radioYes.checked && 
                            tagsContainer.children.length === 0 && 
                            inputWrapper.classList.contains('hidden');

            if (shouldShow) {
                placeholder.classList.remove('hidden');
            } else {
                placeholder.classList.add('hidden');
            }
        }

        /**
         * Cria e adiciona um novo checkbox de dispositivo customizado na tela,
         * AGORA com a nova estrutura de contêiner tracejado.
         * @param {string} deviceName - O nome do dispositivo a ser adicionado.
         * @param {boolean} isChecked - Define se o checkbox deve ser criado já marcado.
         */
        function addCustomDispositivo(deviceName, isChecked = true) {
            if (!deviceName || currentCustomDevices.includes(deviceName)) return;

            currentCustomDevices.push(deviceName);

            // 1. Cria o contêiner externo com o estilo tracejado
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'device-item-box';
            wrapperDiv.dataset.custom = 'true'; // Identificador para o contêiner customizado
            wrapperDiv.dataset.deviceName = deviceName;

            // 2. Cria o label, como antes
            const label = document.createElement('label');
            label.className = 'flex items-center space-x-2 w-full cursor-pointer';

            // 3. Cria o checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'dispositivo';
            checkbox.value = deviceName;
            checkbox.checked = isChecked;
            checkbox.className = 'rounded';

            // 4. Cria o texto (span)
            const span = document.createElement('span');
            span.textContent = deviceName;
            span.title = deviceName;

            // 5. Monta a estrutura: input e span dentro do label
            label.appendChild(checkbox);
            label.appendChild(span);

            // 6. Monta a estrutura final: label dentro do contêiner tracejado
            wrapperDiv.appendChild(label);
            
            // 7. Adiciona o contêiner completo à área de dispositivos customizados
            customDispositivosContainer.appendChild(wrapperDiv);
        }

        /**
         * Configura todos os listeners de evento para o módulo de dispositivos.
         * Garante que os listeners sejam adicionados apenas uma vez.
         */
        function setupDispositivosModule() {
            if (dispositivosListenersAttached) return;

            // NOVO: Listener para o botão "+ Novo Dispositivo"
            addCustomDispositivoBtn.addEventListener('click', () => {
                devicesAddedThisSession = [];
                outrosDispositivosInputWrapper.classList.remove('hidden');
                dispositivoOutrosInput.focus();
            });

            // ALTERADO: Listener do input de texto "Outros"
            dispositivoOutrosInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const deviceName = dispositivoOutrosInput.value.trim();
                    if (deviceName) {
                        addCustomDispositivo(deviceName, true);
                        devicesAddedThisSession.push(deviceName);
                        dispositivoOutrosInput.value = '';
                        // Agora apenas escondemos o input, não precisamos mais mexer em checkbox
                        outrosDispositivosInputWrapper.classList.add('hidden');
                        setUnsavedChanges(true);
                    }
                }
            });

            // Listener para remoção de dispositivos customizados (permanece o mesmo)
            dispositivosGrid.addEventListener('change', (e) => {
                const target = e.target;
                if (target.type === 'checkbox' && target.closest('label[data-custom="true"]')) {
                    if (!target.checked) {
                        // 1. Pega a referência do checkbox que foi desmarcado.
                        const checkboxToRemove = target;
                        
                        // 2. Configura o texto do nosso novo modal genérico.
                        const modal = document.getElementById('generic-confirm-modal');
                        modal.querySelector('#generic-confirm-title').textContent = 'Remover Dispositivo';
                        modal.querySelector('#generic-confirm-text').textContent = 'Desmarcar esta opção removerá este dispositivo da lista. Deseja continuar?';
                        modal.querySelector('#generic-confirm-button').textContent = 'Sim, Remover';

                        const confirmBtn = modal.querySelector('#generic-confirm-button');
                        const cancelBtn = modal.querySelector('#generic-cancel-button');

                        // 3. Clona os botões para limpar quaisquer listeners antigos (truque de segurança).
                        const newConfirmBtn = confirmBtn.cloneNode(true);
                        const newCancelBtn = cancelBtn.cloneNode(true);
                        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

                        // 4. Define o que acontece se o usuário confirmar a remoção.
                        newConfirmBtn.addEventListener('click', () => {
                            const deviceName = checkboxToRemove.value;
                            currentCustomDevices = currentCustomDevices.filter(d => d !== deviceName);
                            checkboxToRemove.closest('label').remove();
                            setUnsavedChanges(true);
                            modal.classList.add('hidden'); // Esconde o modal
                        });

                        // 5. Define o que acontece se o usuário cancelar.
                        newCancelBtn.addEventListener('click', () => {
                            checkboxToRemove.checked = true; // Remarca o checkbox
                            modal.classList.add('hidden'); // Esconde o modal
                        });

                        // 6. Exibe o modal.
                        modal.classList.remove('hidden');

                    }
                } else if (target.type === 'checkbox') {
                    setUnsavedChanges(true);
                }
            });

            dispositivosListenersAttached = true;
        }
        /**
         * Cria um elemento <span> estilizado como uma "pílula" para ser usado em uma lista.
         * Contém o texto e um botão de remoção oculto por padrão.
         * @param {string} text - O texto do item.
         * @returns {HTMLElement}
         */
        function createListItem(text) {
            const item = document.createElement('span');
            // Adicionamos as duas classes no mesmo elemento
            item.className = 'info-tag item-text'; 
            item.dataset.value = text;
            
            // O texto vai diretamente dentro do span principal
            const textNode = document.createTextNode(text + ' '); // Adiciona um espaço antes do botão de remover
            item.appendChild(textNode);

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-item-btn';
            removeBtn.innerHTML = '×';
            item.appendChild(removeBtn);

            return item;
        }

        /**
         * Gerencia o estado (ativo/inativo) do botão principal de salvar.
         * Ativa o botão e aplica o estilo azul quando há alterações.
         * Desativa o botão e aplica um estilo cinza quando não há alterações.
         * @param {boolean} isUnsaved - true se houver alterações, false caso contrário.
         */
        function setUnsavedChanges(isUnsaved) {
            if (hasUnsavedChanges === isUnsaved) return; // Evita execuções desnecessárias

            hasUnsavedChanges = isUnsaved;
            const saveButton = addHandoversForm.querySelector('button[type="submit"]');
            if (!saveButton) return; // Verificação de segurança

            // Classes para o botão ATIVO
            const enabledClasses = ['bg-blue-600', 'hover:bg-blue-700'];
            // Classes para o botão INATIVO
            const disabledClasses = ['bg-gray-400', 'cursor-not-allowed', 'opacity-75'];

            if (isUnsaved) {
                // Habilita o botão
                saveButton.disabled = false;
                saveButton.classList.remove(...disabledClasses);
                saveButton.classList.add(...enabledClasses);
            } else {
                // Desabilita o botão
                saveButton.disabled = true;
                saveButton.classList.remove(...enabledClasses);
                saveButton.classList.add(...disabledClasses);
            }
        }

        /**
         * Reseta completamente o estado e a UI do formulário de passagem de plantão.
         * Garante que nenhum dado de um plantão anterior persista e avisa sobre elementos não encontrados.
         */
        function resetFormState() {
            const formToReset = document.getElementById('add-handovers-form');
            if (formToReset) {
                formToReset.reset();
            }
            const safeClear = (elementId) => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = '';
                } else {
                    console.warn(`[resetFormState] Aviso: Elemento com ID #${elementId} não foi encontrado.`);
                }
            };

            activePrescriptions = [];
            administeredInShift = [];
            patientExams = [];
            currentShiftCompletedExams = [];
            currentCustomDevices = [];
            originalPatientDevices = [];
            clearAllMonitoringValidationErrors();

            safeClear('diagnoses-tags-container');
            safeClear('comorbidities-tags-container');
            safeClear('allergies-tags-container');
            safeClear('precaucoes-container');
            safeClear('riscos-lpp-container');
            safeClear('riscos-quedas-container');
            safeClear('riscos-bronco-container');
            safeClear('riscos-iras-container');
            safeClear('medications-list-container');
            safeClear('custom-dispositivos-container');
            safeClear('fugulin-cuidado-corporal-container');
            safeClear('fugulin-motilidade-container');
            safeClear('fugulin-deambulacao-container');
            safeClear('fugulin-alimentacao-container');
            safeClear('fugulin-eliminacao-container');

            const allergyInputContainer = document.getElementById('allergy-input-container');
            if (allergyInputContainer) allergyInputContainer.classList.add('hidden');
            
            const allergyRadioYes = document.getElementById('allergy-radio-yes');
            if(allergyRadioYes) allergyRadioYes.checked = false;
            
            const allergyRadioNo = document.getElementById('allergy-radio-no');
            if(allergyRadioNo) allergyRadioNo.checked = false;

            const dispositivosGrid = document.getElementById('dispositivos-grid');
            if (dispositivosGrid) {
                dispositivosGrid.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false);
            }
            
            renderExams();
            resetAndCloseExamEditor();

            const inputWrappers = document.querySelectorAll('.input-wrapper');
            if (inputWrappers) {
                inputWrappers.forEach(wrapper => wrapper.classList.add('hidden'));
            }

            const editingModule = document.querySelector('.module-editing');
            if (editingModule) {
                exitEditMode(editingModule);
            }
            
            setUnsavedChanges(false);
        }

        /**
         * Ativa o modo de edição para um módulo, garantindo que apenas um esteja ativo por vez.
         * @param {HTMLElement} moduleElement - O elemento do card do módulo.
         */
        function enterEditMode(moduleElement) {
            if (!moduleElement || moduleElement.classList.contains('module-editing')) {
                return; 
            }

            if (activeEditingModule && activeEditingModule !== moduleElement) {
                exitEditMode(activeEditingModule);
            }

            activeEditingModule = moduleElement;
            moduleElement.classList.add('module-editing');

            // Adiciona uma verificação para esconder os botões 'x' via JS
            if (moduleElement.id === 'module-riscos' || moduleElement.id === 'module-cuidados-enfermagem') {
                const removeButtons = moduleElement.querySelectorAll('.info-tag .remove-item-btn');
                removeButtons.forEach(btn => {
                    btn.style.display = 'none'; // Aplica estilo inline para garantir
                });
            }
        }

        /**
         * Desativa o modo de edição para um módulo, limpa o estado de edição ativo
         * e garante que todas as áreas de input sejam escondidas e as de visualização, exibidas.
         * VERSÃO MODIFICADA: Reseta os botões de Precauções e Dispositivos.
         * @param {HTMLElement} moduleElement - O elemento do card do módulo.
         */
        function exitEditMode(moduleElement) {
            if (!moduleElement) return;

            moduleElement.classList.remove('module-editing');

            // Lógica específica para o módulo de medicações
            if (moduleElement.id === 'module-medicacoes') {
                // Esta é a linha que faltava!
                // Ela chama a função que esconde o editor de medicação.
                resetAndCloseMedicationEditor();
            }

            const inputWrappers = moduleElement.querySelectorAll('.input-wrapper');
            inputWrappers.forEach(wrapper => wrapper.classList.add('hidden'));

            const clickableAreas = moduleElement.querySelectorAll('.clickable-item-area');
            clickableAreas.forEach(area => area.classList.remove('hidden'));
            
            // Verifica se o módulo é um dos que têm o botão de Adicionar/Cancelar
            if (moduleElement.id === 'module-precaucoes' || moduleElement.id === 'module-dispositivos') {
                const triggerWrapper = moduleElement.querySelector('.trigger-wrapper');
                const cancelWrapper = moduleElement.querySelector('.cancel-action-wrapper');
                const inputField = moduleElement.querySelector('.input-wrapper input[type="text"]');

                // Garante que o botão "+ Novo" reapareça
                triggerWrapper?.classList.remove('hidden');
                // Garante que o botão "Cancelar" desapareça
                cancelWrapper?.classList.add('hidden');
                // Limpa o campo de texto
                if(inputField) inputField.value = '';
            }

            if (activeEditingModule === moduleElement) {
                activeEditingModule = null;
            }
            // Se o módulo que está fechando é o de diagnóstico,
            // verifica se a mensagem de placeholder de alergia deve aparecer.
            if (moduleElement.id === 'module-diagnostico') {
                updateAllergyPlaceholder();
            }
        }

        /**
         * Ativa o modo de edição e o campo de input para o módulo de Precauções.
         * @param {HTMLElement} moduleCard - O elemento do card do módulo #module-precaucoes.
         */
        function activatePrecautionsInput(moduleCard) {
            // Não faz nada se o módulo não for encontrado ou já estiver em edição
            if (!moduleCard || moduleCard.classList.contains('module-editing')) {
                return;
            }

            const triggerWrapper = moduleCard.querySelector('.trigger-wrapper');
            const cancelWrapper = moduleCard.querySelector('.cancel-action-wrapper');
            const inputWrapper = moduleCard.querySelector('.input-wrapper');
            const inputField = inputWrapper?.querySelector('input[type="text"]');

            // Esconde o botão "+ Nova" e mostra o "Cancelar" e o campo de input
            if (triggerWrapper) triggerWrapper.classList.add('hidden');
            if (cancelWrapper) cancelWrapper.classList.remove('hidden');
            if (inputWrapper) inputWrapper.classList.remove('hidden');
            if (inputField) inputField.focus(); // Foca no campo para o usuário digitar

            // Coloca o card no estado visual de edição
            enterEditMode(moduleCard);
        }

        //
        /**
         * Move e posiciona uma lista de autocomplete para fora de seu contêiner original,
         * evitando problemas de 'overflow: hidden'.
         * @param {HTMLElement} inputElement - O campo de input que a lista deve seguir.
         * @param {HTMLElement} listElement - A lista de autocomplete a ser posicionada.
         */
        function positionAutocompleteList(inputElement, listElement) {
            // Guarda uma referência ao "lar" original da lista para podermos devolvê-la depois.
            if (!listElement.originalParent) {
                listElement.originalParent = listElement.parentElement;
            }

            // Move a lista para o final do <body> para que ela não seja cortada por nenhum contêiner.
            document.body.appendChild(listElement);

            // Calcula a posição e o tamanho do campo de input na tela.
            const rect = inputElement.getBoundingClientRect();

            // Aplica estilos para posicionar a lista perfeitamente.
            // Usamos 'position: fixed' para que ela ignore o scroll da página e se baseie na janela.
            listElement.style.position = 'fixed';
            listElement.style.top = `${rect.bottom + 2}px`; // 2px abaixo do input
            listElement.style.left = `${rect.left}px`;
            listElement.style.width = `${rect.width}px`;
            listElement.style.zIndex = '5000'; // Um z-index bem alto para garantir que fique na frente de tudo.
        }
        
        // Função para mostrar uma tela específica e esconder as outras
        const showScreen = (screenName) => {
            currentScreen = screenName;

            // Lógica aprimorada para garantir a URL correta
            if (screenName === 'main') {
                // Se a URL atual não for #painel, a corrige sem criar uma nova entrada no histórico.
                if (window.location.hash !== '#painel') {
                    history.replaceState({ screen: 'main' }, 'Painel de Pacientes', '#painel');
                }
            } else if (screenName === 'login') {
                // Limpa o hash para a página de login
                history.pushState({ screen: 'login' }, 'Login', ' ');
            }

            Object.values(screens).forEach(screen => screen.classList.add('hidden'));
            if (screens[screenName]) {
                screens[screenName].classList.remove('hidden');
                screens[screenName].classList.add('flex', 'flex-col');
            }
        };

        const actionLoadingOverlay = document.getElementById('action-loading-overlay');

        /**
         * Exibe o overlay de carregamento de tela cheia.
         */
        function showActionLoader() {
            if (actionLoadingOverlay) {
                actionLoadingOverlay.classList.remove('hidden');
            }
        }

        /**
         * Esconde o overlay de carregamento de tela cheia.
         */
        function hideActionLoader() {
            if (actionLoadingOverlay) {
                actionLoadingOverlay.classList.add('hidden');
            }
        }

        // Função para exibir notificações (toast)
        const showToast = (message, duration = 3000) => {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toast-message');
            toastMessage.textContent = message;
            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, duration);
        };

        /**
         * Verifica se há algum campo de input com erro de validação no formulário.
         * @returns {boolean} - Retorna true se encontrar algum erro, caso contrário, false.
         */
        function checkForInvalidInputs() {
            // Procura por qualquer input que ainda tenha a classe de erro
            const invalidInput = document.querySelector('#module-monitoramento .monitoring-input.has-error');
            return invalidInput !== null;
        }

        /**
         * Limpa o estado de erro de um campo de input e seu display associado.
         * @param {HTMLElement} inputElement - O elemento de input a ser limpo.
         */
        const clearValidationError = (inputElement) => {
            inputElement.classList.remove('has-error');
            const displayArea = inputElement.closest('.clickable-item-area').querySelector('.monitoring-display-area');
            if(displayArea) {
                displayArea.classList.remove('has-error');
            }
            const errorMessageElement = inputElement.nextElementSibling;
            if (errorMessageElement && errorMessageElement.classList.contains('input-error-message')) {
                errorMessageElement.classList.remove('is-visible');
                errorMessageElement.textContent = '';
            }
        };

        /**
         * Exibe uma mensagem de validação inline quando o input está aberto.
         * @param {HTMLElement} inputElement - O elemento de input que falhou na validação.
         */
        const showValidationError = (inputElement) => {
            inputElement.classList.add('has-error');
            const errorMessageElement = inputElement.nextElementSibling;
            if (errorMessageElement && errorMessageElement.classList.contains('input-error-message')) {
                errorMessageElement.textContent = 'Valor inválido'; // Mensagem padronizada
                errorMessageElement.classList.add('is-visible');
            }
        };
        
        /**
         * Remove todos os indicadores de erro (bordas, mensagens e ícones)
         * do módulo de monitoramento.
         */
        function clearAllMonitoringValidationErrors() {
            const module = document.getElementById('module-monitoramento');
            if (!module) return;

            // Remove a classe de erro de todos os inputs
            module.querySelectorAll('.monitoring-input.has-error').forEach(input => {
                input.classList.remove('has-error');
            });

            // Remove a classe de erro de todas as áreas de display
            module.querySelectorAll('.monitoring-display-area.has-error').forEach(display => {
                display.classList.remove('has-error');
            });

            // Esconde todas as mensagens de erro de texto
            module.querySelectorAll('.input-error-message.is-visible').forEach(msg => {
                msg.classList.remove('is-visible');
                msg.textContent = '';
            });
        }


        /**
         * Aplica máscaras e validações aos campos do formulário.
         */
        function applyInputMasksAndValidation() {
            // Máscara para nomes
            const nameInputs = document.querySelectorAll('input[id*="patient-name"], input[id*="register-name"]');
            nameInputs.forEach(input => {
                IMask(input, { mask: /^[a-zA-Z\sçÇãõâêôáéíóúÁÉÍÓÚÀà.`']+$/ });
            });

            // Validação para campos de monitoramento
            const setupValidation = (elementId, min, max) => {
                const input = document.getElementById(elementId);
                if (input) {
                    input.addEventListener('input', () => clearValidationError(input));
                    input.addEventListener('blur', () => {
                        clearValidationError(input);
                        const valueStr = input.value.replace(',', '.').trim();
                        if (valueStr === '') return;

                        const value = parseFloat(valueStr);
                        if (isNaN(value) || value < min || value > max) {
                            showValidationError(input);
                        }
                    });
                }
            };
            
            // Intervalos de monitoramento expandidos
            setupValidation('form-sv-pa', 0, 400);
            setupValidation('form-sv-fc', 0, 400);
            setupValidation('form-sv-fr', 0, 150);
            setupValidation('form-sv-sato2', 0, 100);
            setupValidation('form-sv-temp', 25, 50);
            setupValidation('form-sv-hgt', 0, 1500);
        }

        // Função para definir o modo de visualização e atualizar a UI
        const setViewMode = (mode) => {
            currentViewMode = mode;
            localStorage.setItem('patientViewMode', mode); // Salva a preferência do usuário

            // ATUALIZA O ÍCONE DO BOTÃO
            if (mode === 'grid') {
                viewToggleIconGrid.classList.remove('hidden');
                viewToggleIconList.classList.add('hidden');
            } else {
                viewToggleIconGrid.classList.add('hidden');
                viewToggleIconList.classList.remove('hidden');
            }

            // A MÁGICA ACONTECE AQUI:
            // Em vez de ler da tela, re-renderizamos a lista usando a
            // variável 'currentPatientList', que tem os dados completos.
            renderPatientList(currentPatientList);
            
            // Esconde o menu dropdown
            viewToggleDropdown.classList.add('hidden');
        };

        /**
         * Adiciona um estado ao histórico do navegador para "capturar" o botão de voltar.
         * @param {string} modalId - O ID do modal que está sendo aberto.
         */
        function pushHistoryState(modalId) {
            const state = { modalOpen: modalId };
            // Adiciona um estado com um hash único para este modal
            history.pushState(state, `Modal ${modalId}`, `#${modalId}`);
        }

        /**
         * Remove o estado do histórico do modal, efetivamente voltando para a página principal.
         * Isso é chamado quando o modal é fechado manualmente (pelo botão 'X' ou 'Cancelar').
         */
        function clearHistoryState() {
            // Verifica se o estado atual é de um modal antes de voltar
            if (history.state && history.state.modalOpen) {
                history.back();
            }
        }

        // Função para configurar o comportamento do acordeão no formulário
        function setupFormAccordion() {
            const accordionContainer = document.getElementById('form-accordion-container');
            if (!accordionContainer) return;

            const toggleAccordionSection = (header) => {
                const content = header.nextElementSibling;
                const icon = header.querySelector('svg');
                const isExpanded = content.style.maxHeight && content.style.maxHeight !== '0px';

                // Fecha a seção clicada se ela já estiver aberta
                if (isExpanded) {
                    content.style.maxHeight = '0px';
                    icon.style.transform = 'rotate(0deg)';
                } else {
                    // Fecha todas as outras seções antes de abrir a nova
                    accordionContainer.querySelectorAll('.accordion-form-content').forEach(item => {
                        item.style.maxHeight = '0px';
                        const otherIcon = item.previousElementSibling.querySelector('svg');
                        if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
                    });

                    // Abre a seção clicada
                    content.style.maxHeight = content.scrollHeight + 'px';
                    icon.style.transform = 'rotate(180deg)';
                }
            };
            
            // Adiciona o listener de clique ao container (delegação de evento)
            accordionContainer.addEventListener('click', (e) => {
                const header = e.target.closest('.accordion-form-header');
                if (header) {
                    toggleAccordionSection(header);
                }
            });

            // Listener para fechar o modal de histórico
            closeModuleHistoryModalBtn.addEventListener('click', () => {
                moduleHistoryModal.classList.add('hidden');
                clearHistoryState();
            });


            // Abre a primeira seção por padrão para guiar o usuário
            const firstHeader = accordionContainer.querySelector('.accordion-form-header');
            if (firstHeader) {
                // Atraso pequeno para garantir que o DOM está pronto para calcular o scrollHeight
                setTimeout(() => {
                    toggleAccordionSection(firstHeader);
                }, 100);
            }
            // Adiciona listener para o botão de histórico de exames
            const formAccordionContainer = document.getElementById('form-accordion-container');
            if(formAccordionContainer) {
                formAccordionContainer.addEventListener('click', (e) => {
                    const targetId = e.target.id;

                    // Mapeia os links do sumário para os seus botões de toggle internos
                    const summaryLinksMap = {
                        'quick-view-exam-history-btn': 'toggle-exam-history-btn',
                        'quick-view-recent-meds-btn': 'toggle-recent-meds-btn' // Link para o histórico de medicações
                    };


                    if (summaryLinksMap[targetId]) {
                        e.preventDefault();
                        e.stopPropagation();

                        // 1. Identifica os elementos relevantes
                        const header = e.target.closest('.accordion-form-header');
                        const content = header.nextElementSibling;
                        const isAccordionClosed = !content.style.maxHeight || content.style.maxHeight === '0px';

                        const internalToggleButton = document.getElementById(summaryLinksMap[targetId]);
                        const internalList = internalToggleButton.nextElementSibling;
                        const isInternalListHidden = internalList.classList.contains('hidden');

                        // 2. PRIMEIRO, garante que a lista interna esteja visível.
                        // Isso é crucial para que o cálculo da altura do acordeão seja correto.
                        if (isInternalListHidden) {
                            internalToggleButton.click(); // Simula o clique no botão "> Ver histórico" para mostrar a lista
                        }

                        // 3. AGORA, se o acordeão principal estava fechado, manda ele abrir.
                        // Como a lista interna já está visível, o cálculo de `scrollHeight` será correto.
                        if (isAccordionClosed) {
                            header.click(); // Simula o clique no cabeçalho para abrir o acordeão
                        }
                        
                        // 4. Se o acordeão já estava aberto, mas a lista interna estava escondida,
                        // o clique no `internalToggleButton` mudou a altura do conteúdo, então recalculamos.
                        else if (!isAccordionClosed && isInternalListHidden) {
                            recalculateOpenAccordionHeight();
                        }
                    }
                });
            }

            // Listener para o formulário de monitoramento
            const monitoringContent = document.getElementById('monitoring-form-content');
            if (monitoringContent) {
                monitoringContent.addEventListener('input', (e) => {
                    // Verifica se o evento veio de um dos nossos inputs
                    if (e.target.classList.contains('monitoring-input')) {
                        updateMonitoringSummary();
                    }
                });
            }

            // Listener para o campo de Pendências
            const pendingObsTextarea = document.getElementById('form-pending-obs');
            if (pendingObsTextarea) {
                pendingObsTextarea.addEventListener('input', updatePendingObsSummary);
            }

        }

        // Atualiza o sumário de monitoramento com base nos valores dos inputs
        function updateMonitoringSummary() {
            const summaryContainer = document.getElementById('summary-monitoramento');
            if (!summaryContainer) return;

            const values = {
                'PA': document.getElementById('form-sv-pa').value,
                'FC': document.getElementById('form-sv-fc').value,
                'FR': document.getElementById('form-sv-fr').value,
                'SatO₂': document.getElementById('form-sv-sato2').value,
                'Temp': document.getElementById('form-sv-temp').value,
                'HGT': document.getElementById('form-sv-hgt').value
            };

            const summaryParts = [];
            // Constrói a parte dos sinais vitais
            for (const [key, value] of Object.entries(values)) {
                if (value) {
                    summaryParts.push(`<strong>${key}:</strong> ${value}`);
                }
            }

            let summaryHTML = '';
            if (summaryParts.length > 0) {
                summaryHTML = summaryParts.join(' <span class="text-gray-300">|</span> ');
            }
            
            // Adiciona o campo "Outros" se preenchido
            const othersValue = document.getElementById('form-sv-others').value;
            if (othersValue) {
                if (summaryHTML !== '') {
                    summaryHTML += ' <span class="text-gray-300">|</span> ';
                }
                // Mostra um trecho do campo "Outros"
                summaryHTML += `<strong>Outros:</strong> ${othersValue.substring(0, 20)}${othersValue.length > 20 ? '...' : ''}`;
            }

            if (summaryHTML === '') {
                summaryContainer.innerHTML = `<p class="italic text-gray-500">Nenhum dado de monitoramento inserido.</p>`;
            } else {
                summaryContainer.innerHTML = `<p class="font-mono text-xs md:text-sm">${summaryHTML}</p>`;
            }
        }

        // Atualiza o sumário de pendências e observações
        function updatePendingObsSummary() {
            const summaryContainer = document.getElementById('summary-pending-obs');
            const textArea = document.getElementById('form-pending-obs');
            if (!summaryContainer || !textArea) return;

            const text = textArea.value.trim();

            if (text === '') {
                // Mantém a mensagem padrão quando o campo está vazio
                summaryContainer.innerHTML = `<p class="italic text-gray-500">Nenhuma pendência ou observação.</p>`;
            } else {
                // Exibe o título "Observação:", remove o limite de 80 caracteres e adiciona a margem
                summaryContainer.innerHTML = `
                    <div class="mb-2">
                        <p class="text-sm text-gray-700">
                            <strong class="font-medium">Observação:</strong> ${text}
                        </p>
                    </div>
                `;
            }
        }

        function updateMedicationSummary(source = 'desconhecido') {
            const summaryContainer = document.getElementById('summary-medicacoes');
            if (!summaryContainer) return;

            if (!currentMedications || currentMedications.length === 0) {
                summaryContainer.innerHTML = `<p class="italic text-gray-500">Nenhuma medicação adicionada neste plantão.</p>`;
                return;
            }

            let html = '<div class="space-y-1">';
            currentMedications.forEach(med => {
                if (med.times && med.times.length > 0) {
                    // Reutiliza a mesma lógica de agrupamento da função renderMedicationTimes
                    const groupedByDay = med.times.reduce((acc, timestamp) => {
                        const date = new Date(timestamp);
                        const dayKey = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        if (!acc[dayKey]) {
                            acc[dayKey] = [];
                        }
                        acc[dayKey].push(timestamp);
                        return acc;
                    }, {});
                    
                    const summaryParts = Object.keys(groupedByDay).sort().map(dayKey => {
                        const timesOnDay = groupedByDay[dayKey].sort().map(ts => 
                            new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
                        );
                        return `${timesOnDay.join(', ')} (${dayKey})`;
                    });
                    
                    html += `<p class="text-sm text-gray-700"><span class="font-semibold">${med.name}</span> (às ${summaryParts.join(' e ')})</p>`;

                } else {
                    // Caso uma medicação seja adicionada mas nenhum horário ainda
                    html += `<p class="text-sm text-gray-700"><span class="font-semibold">${med.name}</span> (nenhum horário registrado)</p>`;
                }
            });
            html += `</div>`;
            summaryContainer.innerHTML = html;
        }

        // Atualiza o sumário de Diagnósticos e Comorbidades
        function updateDiagnosisSummary() {
            const summaryContainer = document.getElementById('summary-diagnostico');
            if (!summaryContainer) return;

            const diagnoses = getTagsFromContainer('diagnoses-tags-container');
            const comorbidities = getTagsFromContainer('comorbidities-tags-container');
            const allergies = getTagsFromContainer('allergies-tags-container');
            const evolutionTextarea = document.getElementById('form-evolution');
            const evolutionText = evolutionTextarea ? evolutionTextarea.value.trim() : '';

            // Condição de verificação
            if (diagnoses.length === 0 && comorbidities.length === 0 && allergies.length === 0) {
                summaryContainer.innerHTML = `<p class="italic text-gray-500">Nenhum diagnóstico, comorbidade ou alergia adicionado.</p>`;
                return;
            }

            let html = '';

            if (diagnoses.length > 0) {
                html += `
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-medium text-sm mr-2">Diagnósticos:</span>
                        ${diagnoses.map(tag =>
                            `<span class="inline-block bg-gray-200 text-gray-800 text-xs font-semibold px-2 py-0.5 rounded-full">${tag}</span>`
                        ).join(' ')}
                    </div>
                `;
            }

            if (comorbidities.length > 0) {
                html += `
                    <div class="flex flex-wrap items-center gap-2 ${diagnoses.length > 0 ? 'mt-2' : ''}">
                        <span class="font-medium text-sm mr-2">Comorbidades:</span>
                        ${comorbidities.map(tag =>
                            `<span class="inline-block bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded-full">${tag}</span>`
                        ).join(' ')}
                    </div>
                `;
            }

            if (allergies.length > 0) {
                html += `
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="font-medium text-sm mr-2">Alergias:</span>
                        ${allergies.map(tag =>
                            `<span class="inline-block bg-gray-300 text-gray-900 text-xs font-semibold px-2 py-0.5 rounded-full">${tag}</span>`
                        ).join(' ')}
                    </div>
                `;
            }
            
            if (evolutionText !== '') {
                // Adiciona um separador se já houver tags
                if (html !== '') {
                    html += '<div class="mt-2 pt-2 border-t border-gray-200/75"></div>';
                }
                const preview = evolutionText.substring(0, 120); // Limita para não quebrar o layout
                html += `<p class="text-sm text-gray-700"><strong class="font-medium">Evolução:</strong> ${preview}${evolutionText.length > 120 ? '...' : ''}</p>`;
            }

            summaryContainer.innerHTML = html;
        }

        // --- LÓGICA DE EXAMES ---
        function updateExamSummary() {
            const summaryContainer = document.getElementById('summary-exames');
            if (!summaryContainer) return;

            const scheduled = patientExams.filter(e => e.status === 'scheduled').map(e => e.name);
            const pending = patientExams.filter(e => e.status === 'pending').map(e => e.name);
            const completed = patientExams.filter(e => e.status === 'completed').map(e => e.name);

            if (scheduled.length === 0 && pending.length === 0 && completed.length === 0) {
                summaryContainer.innerHTML = `<p class="italic text-gray-500">Nenhum exame registrado para este plantão.</p>`;
                return;
            }

            let html = '';
            if (scheduled.length > 0) {
                html += `<p class="text-sm"><strong class="font-medium">Agendados:</strong> ${scheduled.join(', ')}</p>`;
            }
            if (pending.length > 0) {
                html += `<p class="text-sm mt-1"><strong class="font-medium">Pendentes:</strong> ${pending.join(', ')}</p>`;
            }
            if (completed.length > 0) {
                html += `<p class="text-sm mt-1"><strong class="font-medium">Finalizados:</strong> ${completed.join(', ')}</p>`;
            }
            summaryContainer.innerHTML = html;
        }


        
        // --- LÓGICA DE EVENTOS (SETUP) ---

        // Listener para avisar sobre saída com alterações não salvas
        window.addEventListener('beforeunload', (event) => {
            if (hasUnsavedChanges) {
                event.preventDefault();
                // A string não é exibida na maioria dos navegadores modernos, mas é necessária para acionar o prompt
                event.returnValue = '';
            }
        });

        // Listener para abrir o modal de histórico completo (delegação de evento)
        document.getElementById('patient-detail-screen').addEventListener('click', (e) => {
            if (e.target && e.target.id === 'open-full-history-btn') {
                currentHistoryPage = 1; // Reseta para a primeira página ao abrir
                renderHandoversList(currentHandovers); // Re-renderiza para garantir que a página 1 seja exibida
                fullHistoryModal.classList.remove('hidden');
                pushHistoryState('full-history-modal');
            }
        });

        // Listener para fechar o modal
        closeFullHistoryModalBtn.addEventListener('click', () => {
            fullHistoryModal.classList.add('hidden');
        });

        // Listener unificado para os eventos DENTRO do modal (paginação, adendo, etc.)
        fullHistoryContentWrapper.addEventListener('click', (e) => {
            // Procura pelo botão principal do item da lista
            const historyItemButton = e.target.closest('.history-item-button');
            
            if (historyItemButton) {
                const handoverId = historyItemButton.dataset.handoverId;
                const handoverData = currentHandovers.find(h => h.id === handoverId);

                if (handoverData) {
                    // Preenche e exibe o modal de detalhes
                    populateHandoverViewModal(handoverData);
                    
                    // Esconde o modal de histórico e mostra o de visualização
                    fullHistoryModal.classList.add('hidden');
                    viewHandoverModal.classList.remove('hidden');
                }
            }
        });

        // Listener para os botões de paginação no modal de histórico
        document.getElementById('full-history-pagination').addEventListener('click', (e) => {
            const pageButton = e.target.closest('.page-button');
            if (pageButton && !pageButton.disabled) {
                const newPage = parseInt(pageButton.dataset.page, 10);
                if (newPage) {
                    currentHistoryPage = newPage;
                    // Re-renderiza a lista com a nova página
                    renderHandoversList(currentHandovers);
                }
            }
        });

        // Listeners para o botão de visualização
        viewToggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            viewToggleDropdown.classList.toggle('hidden');
        });



        document.querySelectorAll('.view-option-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const newMode = e.currentTarget.dataset.view;
                setViewMode(newMode);
            });
        });


        // Seleciona os elementos do novo modal
        const addAdendoModal = document.getElementById('add-adendo-modal');
        const closeAdendoModalButton = document.getElementById('close-adendo-modal-button');
        const addAdendoForm = document.getElementById('add-adendo-form');
        const adendoHandoverIdInput = document.getElementById('adendo-handover-id');
        const adendoTextInput = document.getElementById('adendo-text');


        if (editPatientDetailsButton) {
            editPatientDetailsButton.addEventListener('click', () => {
                // Verifica se temos um paciente carregado na tela
                if (currentPatientData) {
                    // Reutiliza a função que já existe para abrir e popular o modal de edição
                    openEditModal(currentPatientData);
                } else {
                    showToast("Não há dados do paciente para editar.", "error");
                }
            });
        }

        // INÍCIO - LÓGICA REATORADA DO MÓDULO DE EXAMES

        // --- Estado e Elementos da UI para Exames ---
        let patientExams = []; // Array principal que guardará os objetos de exame
        const examEditorArea = document.getElementById('exam-editor-area');
        const examListsContainer = document.getElementById('exam-lists-container');
        const addNewExamBtn = document.getElementById('add-new-exam-btn');
        const examMainActionArea = document.getElementById('exam-main-action-area');

        // Mapeamento de todos os elementos do editor para fácil acesso
        const editor = {
            id: document.getElementById('exam-editor-id'),
            mode: document.getElementById('exam-editor-mode'),
            title: document.getElementById('exam-editor-title'),
            nameInputWrapper: document.getElementById('exam-editor-name-input-wrapper'),
            nameInput: document.getElementById('exam-editor-name-input'),
            nameDisplayWrapper: document.getElementById('exam-editor-name-display-wrapper'),
            nameDisplay: document.getElementById('exam-editor-name-display'),
            flowChoiceWrapper: document.getElementById('exam-editor-flow-choice-wrapper'),
            flowScheduleBtn: document.getElementById('exam-editor-flow-schedule-btn'),
            flowRegisterBtn: document.getElementById('exam-editor-flow-register-btn'),
            datetimeWrapper: document.getElementById('exam-editor-datetime-wrapper'),
            datetimeLabel: document.getElementById('exam-editor-datetime-label'),
            datetimeInput: document.getElementById('exam-editor-datetime-input'),
            resultChoiceWrapper: document.getElementById('exam-editor-result-choice-wrapper'),
            resultYesBtn: document.getElementById('exam-editor-result-yes-btn'),
            resultNoBtn: document.getElementById('exam-editor-result-no-btn'),
            resultTextareaWrapper: document.getElementById('exam-editor-result-textarea-wrapper'),
            resultTextarea: document.getElementById('exam-editor-result-textarea'),
            actionsWrapper: document.getElementById('exam-editor-actions-wrapper'),
            backBtn: document.getElementById('exam-editor-back-btn'),
            saveBtn: document.getElementById('exam-editor-save-btn')
        };

        const closeExamEditorBtn = document.getElementById('close-exam-editor-btn');


        // --- Funções Principais de Renderização ---

        /**
         * Converte uma string de data e hora no formato "DD/MM/YYYY HH:mm" para um objeto Date.
         * @param {string} dateTimeString - A string de data e hora (ex: "16/08/2025 18:59").
         * @returns {Date} - O objeto Date correspondente.
         */
        function parseBrazilianDateTime(dateTimeString) {
            if (!dateTimeString) {
                return new Date(); // Retorna a data atual se a string for vazia
            }
            
            // Usa uma expressão regular para extrair as partes da data e hora
            const parts = dateTimeString.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
            
            if (!parts) {
                console.warn(`Formato de data inválido recebido: ${dateTimeString}. Usando data atual.`);
                return new Date(); // Retorna data atual como fallback se o formato for incorreto
            }
            
            // parts[0] é a string completa, os grupos de captura começam em parts[1]
            // parts -> ["16/08/2025 18:59", "16", "08", "2025", "18", "59"]
            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1; // Mês é 0-indexado em JS (Jan=0, Dez=11)
            const year = parseInt(parts[3], 10);
            const hours = parseInt(parts[4], 10);
            const minutes = parseInt(parts[5], 10);
            
            return new Date(year, month, day, hours, minutes);
        }

        /**
         * Renderiza os exames do estado `patientExams` nas colunas corretas.
         * AGORA, a lista de agendados é ordenada por data (do mais próximo ao mais distante).
         */
        function renderExams() {
            const lists = {
                scheduled: document.getElementById('scheduled-exams-list'),
                pending: document.getElementById('pending-exams-list'),
            };

            // Limpa as listas antes de renderizar
            Object.values(lists).forEach(list => list.innerHTML = '');

            // 1. Filtra e ORDENA apenas os exames agendados
            const scheduledExams = patientExams
                .filter(exam => exam.status === 'scheduled')
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); // Ordena do menor timestamp (mais antigo/próximo) para o maior

            // 2. Filtra os exames pendentes (a ordem deles não importa tanto)
            const pendingExams = patientExams.filter(exam => exam.status === 'pending');

            // 3. Renderiza cada lista ordenada
            scheduledExams.forEach(exam => {
                const examItemEl = createExamItemElement(exam);
                lists.scheduled.appendChild(examItemEl);
            });

            pendingExams.forEach(exam => {
                const examItemEl = createExamItemElement(exam);
                lists.pending.appendChild(examItemEl);
            });
        }

        /**
         * Cria o elemento HTML para um único item de exame com os botões CORRETOS para cada fluxo.
         * - Adiciona destaque visual para exames agendados com mais de 24h de atraso.
         * - Formata a data de exames pendentes para exibir apenas data/hora, sem "Hoje" ou "Amanhã".
         * @param {object} exam - O objeto de exame.
         * @returns {HTMLElement} - O elemento div do item de exame.
         */
        function createExamItemElement(exam) {
            const item = document.createElement('div');
            item.dataset.id = exam.id;

            const now = new Date();
            const examDate = new Date(exam.timestamp || 0);
            const twentyFourHoursInMillis = 24 * 60 * 60 * 1000;
            const isOverdue = exam.status === 'scheduled' && (now.getTime() - examDate.getTime()) > twentyFourHoursInMillis;
            
            let cardClasses = 'exam-item'; // A classe base será estilizada no CSS
            if (isOverdue) {
                cardClasses += ' bg-red-50 border-red-200'; 
            }
            item.className = cardClasses;

            let formattedTime = '';
            if (exam.timestamp && typeof exam.timestamp === 'number') {
                switch(exam.status) {
                    case 'scheduled':
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const tomorrow = new Date(today);
                        tomorrow.setDate(today.getDate() + 1);
                        const examDayOnly = new Date(examDate);
                        examDayOnly.setHours(0, 0, 0, 0);
                        const examTimeStr = examDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                        if (examDayOnly.getTime() === today.getTime()) {
                            formattedTime = `<strong>HOJE</strong> às ${examTimeStr}`;
                        } else if (examDayOnly.getTime() === tomorrow.getTime()) {
                            formattedTime = `Amanhã às ${examTimeStr}`;
                        } else {
                            formattedTime = examDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                        }
                        break;

                    case 'pending':
                        formattedTime = examDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                        break;
                    
                    default:
                        formattedTime = 'Não especificado';
                }
            } else {
                formattedTime = 'Não especificado';
            }

            let actionsHtml = '';

            switch (exam.status) {
                case 'scheduled':
                    actionsHtml = `
                        <button type="button" data-action="register-realization" title="Registrar Realização" class="text-blue-600 hover:text-blue-800 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        </button>
                        <button type="button" data-action="reschedule" title="Reagendar" class="text-blue-600 hover:text-blue-800 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6"><path fill-rule="evenodd" d="M12 5.25c1.213 0 2.415.046 3.605.135a3.256 3.256 0 0 1 3.01 3.01c.044.583.077 1.17.1 1.759L17.03 8.47a.75.75 0 1 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 0 0-1.06-1.06l-1.752 1.751c-.023-.65-.06-1.296-.108-1.939a4.756 4.756 0 0 0-4.392-4.392 49.422 49.422 0 0 0-7.436 0A4.756 4.756 0 0 0 3.89 8.282c-.017.224-.033.447-.046.672a.75.75 0 1 0 1.497.092c.013-.217.028-.434.044-.651a3.256 3.256 0 0 1 3.01-3.01c1.19-.09 2.392-.135 3.605-.135Zm-6.97 6.22a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 1 0 1.06 1.06l1.752-1.751c.023.65.06 1.296.108 1.939a4.756 4.756 0 0 0 4.392 4.392 49.413 49.413 0 0 0 7.436 0 4.756 4.756 0 0 0 4.392-4.392c.017-.223.032-.447.046-.672a.75.75 0 0 0-1.497-.092c-.013.217-.028.434-.044.651a3.256 3.256 0 0 1-3.01 3.01 47.953 47.953 0 0 1-7.21 0 3.256 3.256 0 0 1-3.01-3.01 47.759 47.759 0 0 1-.1-1.759L6.97 15.53a.75.75 0 0 0 1.06-1.06l-3-3Z" clip-rule="evenodd" /></svg>
                        </button>
                        <button type="button" data-action="cancel" title="Cancelar Exame" class="text-red-600 hover:text-red-800 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>
                        </button>
                    `;
                    break;
                case 'pending':
                    actionsHtml = `
                        <button type="button" data-action="register-result" title="Registrar Resultado" class="text-blue-600 hover:text-blue-800 transition-colors">
                            <svg class="size-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 1 0-18c1.052 0 2.062.18 3 .512M7 9.577l3.923 3.923 8.5-8.5M17 14v6m-3-3h6"/></svg>
                        </button>
                        <button type="button" data-action="cancel" title="Cancelar Exame" class="text-red-600 hover:text-red-800 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>
                        </button>
                    `;
                    break;
            }
            
            item.innerHTML = `
                <div class="exam-info-container">
                    <p class="font-bold text-gray-800">${exam.name}</p>
                    <p class="text-xs text-gray-500">${exam.status === 'scheduled' ? 'Agendado para:' : 'Realizado em:'} ${formattedTime}</p>
                </div>
                <div class="exam-actions-container">
                    ${actionsHtml}
                </div>
            `;
            return item;
        }


        // --- Funções de Gerenciamento do Editor ---

        /**
         * Abre o editor de exames no modo de registro de resultado para um exame PENDENTE.
         * @param {string} examId - O ID do exame pendente.
         */
        function openEditorForResult(examId) {
            resetAndCloseExamEditor(); // Garante que o editor está limpo
            const moduleExames = document.getElementById('module-exames');
            if (moduleExames) {
                enterEditMode(moduleExames);
            }
            const exam = patientExams.find(e => e.id === examId);
            if (!exam) {
                showToast("Erro: Exame não encontrado para registrar o resultado.", "error");
                return;
            }

            // Preenche o editor com os dados do exame
            editor.mode.value = 'register-result';
            editor.id.value = examId;
            editor.title.textContent = `Registrar Resultado`;
            editor.nameDisplay.textContent = exam.name;
            
            // Mostra os wrappers relevantes
            editor.nameDisplayWrapper.classList.remove('hidden'); // Mostra o nome (não editável)
            editor.datetimeWrapper.classList.remove('hidden');   // Mostra o seletor de data/hora para a data do resultado
            editor.resultTextareaWrapper.classList.remove('hidden'); // Mostra a área para digitar o resultado
            editor.actionsWrapper.classList.remove('hidden');    // Mostra os botões Salvar/Cancelar
            
            // Configura o label e o calendário
            editor.datetimeLabel.textContent = "Data e Hora do Resultado";
            flatpickrInstance = flatpickr("#exam-editor-datetime-input", configRegistro); // Usa configRegistro para permitir datas passadas

            // Exibe o editor e esconde o botão "+ Novo Exame"
            examEditorArea.classList.remove('hidden');
            examMainActionArea.classList.add('hidden');
            
            editor.resultTextarea.focus(); // Foca na área de resultado para digitação imediata
        }

        /**
         * Reseta o editor de exames para seu estado inicial e o esconde.
         */

        // Função para ABRIR editor de NOVO EXAME
        function openEditorForNewExam() {
            resetAndCloseExamEditor(); // Primeiro, garante que tudo está limpo
            const moduleExames = document.getElementById('module-exames');
            if (moduleExames) {
                enterEditMode(moduleExames);
            }
            editor.mode.value = 'new';
            editor.title.textContent = 'Adicionar Novo Exame';
            editor.nameInputWrapper.classList.remove('hidden');
            editor.flowChoiceWrapper.classList.remove('hidden');
            examEditorArea.classList.remove('hidden');
            examMainActionArea.classList.add('hidden');
            editor.nameInput.focus();

            // Inicia o Flatpickr para AGENDAMENTO
            flatpickrInstance = flatpickr("#exam-editor-datetime-input", configAgendamento);
        }

        /**
         * NOVA FUNÇÃO
         * Abre o editor de exames no modo de reagendamento para um exame existente.
         * @param {string} examId - O ID do exame a ser reagendado.
         */
        function openEditorForReschedule(examId) {
            resetAndCloseExamEditor(); // Garante que o editor está limpo
            const moduleExames = document.getElementById('module-exames');
            if (moduleExames) {
                enterEditMode(moduleExames);
            }
            const exam = patientExams.find(e => e.id === examId);
            if (!exam) {
                showToast("Erro: Exame não encontrado para reagendar.", "error");
                return;
            }

            // Preenche o editor com os dados do exame
            editor.mode.value = 'reschedule';
            editor.id.value = examId;
            editor.title.textContent = `Reagendar Exame`;
            editor.nameDisplay.textContent = exam.name;
            
            // Mostra os wrappers relevantes
            editor.nameDisplayWrapper.classList.remove('hidden'); // Mostra o nome (não editável)
            editor.datetimeWrapper.classList.remove('hidden');   // Mostra o seletor de data/hora
            editor.actionsWrapper.classList.remove('hidden');    // Mostra os botões Salvar/Cancelar
            
            // Configura o label e o calendário
            editor.datetimeLabel.textContent = "Selecione a Nova Data e Hora";
            flatpickrInstance = flatpickr("#exam-editor-datetime-input", configAgendamento);

            // Exibe o editor e esconde o botão "+ Novo Exame"
            examEditorArea.classList.remove('hidden');
            examMainActionArea.classList.add('hidden');
        }

        // Função para ABRIR editor de REGISTRO DE REALIZAÇÃO
        function openEditorForRegistration(examId) {
            resetAndCloseExamEditor(); // Primeiro, garante que tudo está limpo
            const moduleExames = document.getElementById('module-exames');
            if (moduleExames) {
                enterEditMode(moduleExames);
            }
            const exam = patientExams.find(e => e.id === examId);
            if (!exam) return;

            editor.mode.value = 'register-realization';
            editor.id.value = examId;
            editor.title.textContent = `Registrar Realização: ${exam.name}`;
            editor.nameDisplay.textContent = exam.name;
            editor.nameDisplayWrapper.classList.remove('hidden');
            editor.datetimeInput.value = new Date().toISOString().slice(0, 16);
            editor.datetimeLabel.textContent = "Data e Hora da Realização";
            editor.datetimeWrapper.classList.remove('hidden');
            editor.resultChoiceWrapper.classList.remove('hidden');
            examEditorArea.classList.remove('hidden');
            examMainActionArea.classList.add('hidden');

            // Inicia o Flatpickr para REGISTRO (com maxDate)
            flatpickrInstance = flatpickr("#exam-editor-datetime-input", configRegistro);
        }

        // Função para RESETAR E FECHAR o editor (agora também destrói o calendário)
        function resetAndCloseExamEditor() {
            // 1. Destrói a instância ativa do Flatpickr, se houver
            if (flatpickrInstance) {
                flatpickrInstance.destroy();
                flatpickrInstance = null; // Limpa a referência
            }

            // 2. Esconde a área de edição e mostra o botão de "+ Novo Exame"
            examEditorArea.classList.add('hidden');
            examMainActionArea.classList.remove('hidden');
            
            // 3. Reseta os valores dos campos do editor
            editor.id.value = '';
            editor.mode.value = '';
            editor.nameInput.value = '';
            editor.datetimeInput.value = '';
            editor.resultTextarea.value = '';
            
            // 4. Esconde todos os 'wrappers' internos do editor
            Object.values(editor).forEach(element => {
                if (element.id && element.id.endsWith('-wrapper')) {
                    element.classList.add('hidden');
                }
            });
        }
        // --- Novos Listeners para o fluxo interno do editor ---

        // Cenário A: Escolhendo 'Agendar'
        editor.flowScheduleBtn.addEventListener('click', () => {
            editor.datetimeLabel.textContent = "Agendar Para";
            editor.datetimeWrapper.classList.remove('hidden');
            editor.actionsWrapper.classList.remove('hidden');
            editor.flowChoiceWrapper.classList.add('hidden');
        });

        // Cenário A: Escolhendo 'Registrar Realização'
        editor.flowRegisterBtn.addEventListener('click', () => {
            editor.datetimeLabel.textContent = "Data e Hora da Realização";
            editor.datetimeInput.value = new Date().toISOString().slice(0, 16);
            editor.datetimeWrapper.classList.remove('hidden');
            editor.resultChoiceWrapper.classList.remove('hidden');
            editor.flowChoiceWrapper.classList.add('hidden');
        });

        // Cenários A e B: Escolhendo 'Sim' para resultado
        editor.resultYesBtn.addEventListener('click', () => {
            editor.resultTextareaWrapper.classList.remove('hidden');
            editor.actionsWrapper.classList.remove('hidden');
            editor.resultChoiceWrapper.classList.add('hidden');
            editor.resultTextarea.focus();
        });

        // Cenários A e B: Escolhendo 'Não' para resultado
        editor.resultNoBtn.addEventListener('click', () => {
            editor.resultTextarea.value = ''; 
            editor.saveBtn.click(); // Salva o estado "pendente"
        });

        // Botão "Salvar" - O CÉREBRO DO MÓDULO
        editor.saveBtn.addEventListener('click', () => {
            const id = editor.id.value;
            const mode = editor.mode.value;
            const name = id ? editor.nameDisplay.textContent : editor.nameInput.value.trim();

            if (!name) {
                showToast("O nome do exame é obrigatório.", "error");
                return;
            }

            const timestamp = editor.datetimeInput.value ? parseBrazilianDateTime(editor.datetimeInput.value).getTime() : Date.now();
            const result = editor.resultTextarea.value.trim();

            // --- Lógica Principal ---
            if (mode === 'reschedule') {
                const examIndex = patientExams.findIndex(e => e.id === id);
                if (examIndex > -1) {
                    const oldTimestamp = patientExams[examIndex].timestamp;
                    patientExams[examIndex].timestamp = timestamp;

                    currentShiftRescheduledExams.push({
                        id: id, name: name, oldTimestamp: oldTimestamp, newTimestamp: timestamp
                    });
                    showToast(`Exame '${name}' reagendado.`, 'success');
                }
            } else {
                let newStatus;

                // --- INÍCIO DA CORREÇÃO PRINCIPAL ---
                // Verifica se o fluxo de "Registrar Realização" foi iniciado,
                // olhando se os botões de resultado (Sim/Não) ou a área de texto do resultado estavam visíveis.
                const wasResultFlowInitiated = !editor.resultChoiceWrapper.classList.contains('hidden') || !editor.resultTextareaWrapper.classList.contains('hidden');

                if (result) {
                    // 1. Se tem texto de resultado, está sempre 'completed'.
                    newStatus = 'completed';
                } else if (mode === 'register-realization' || (mode === 'new' && wasResultFlowInitiated)) {
                    // 2. Fica 'pending' se:
                    //    a) Estamos atualizando um exame agendado para registrar sua realização.
                    //    b) Estamos criando um NOVO exame e o usuário clicou em "Registrar Realização" (e depois em "Não").
                    newStatus = 'pending';
                } else {
                    // 3. Em todos os outros casos (principalmente um novo exame via botão "Agendar"),
                    // o status é 'scheduled'.
                    newStatus = 'scheduled';
                }
                // --- FIM DA CORREÇÃO PRINCIPAL ---

                if (mode === 'new') {
                    const newExam = {
                        id: `exam_${Date.now()}`, name, status: newStatus, timestamp, result: result || ''
                    };

                    if (newStatus === 'completed') {
                        currentShiftCompletedExams.push(newExam);
                    } else {
                        patientExams.push(newExam);
                    }
                } else { // Atualizando um exame existente
                    const examIndex = patientExams.findIndex(e => e.id === id);
                    if (examIndex > -1) {
                        const originalExam = patientExams.splice(examIndex, 1)[0];

                        if (newStatus === 'completed') {
                            const completedExam = { ...originalExam, status: 'completed', result: result, timestamp: timestamp };
                            currentShiftCompletedExams.push(completedExam);
                            showToast(`Resultado de '${name}' salvo!`, 'success');
                        } else if (newStatus === 'pending') {
                            originalExam.status = 'pending';
                            originalExam.timestamp = timestamp;
                            patientExams.push(originalExam);
                        }
                    }
                }
            }
            
            renderExams();
            resetAndCloseExamEditor();
            setUnsavedChanges(true);
        });

        // --- Lógica de Manipulação de Eventos ---

        // Botão principal "+ Novo Exame"
        addNewExamBtn.addEventListener('click', openEditorForNewExam);

        // Botão "Voltar" dentro do editor
        editor.backBtn.addEventListener('click', () => {
            // Se a área de texto do resultado estiver visível, volta para a escolha de "Sim/Não".
            if (!editor.resultTextareaWrapper.classList.contains('hidden')) {
                editor.resultTextareaWrapper.classList.add('hidden');
                editor.actionsWrapper.classList.add('hidden'); // Esconde os botões Salvar/Voltar
                editor.resultChoiceWrapper.classList.remove('hidden'); // Mostra os botões Sim/Não
                return; 
            }

            // Se o seletor de data/hora ou a escolha de resultado estiverem visíveis...
            if (!editor.datetimeWrapper.classList.contains('hidden') || !editor.resultChoiceWrapper.classList.contains('hidden')) {
                editor.datetimeWrapper.classList.add('hidden');
                editor.resultChoiceWrapper.classList.add('hidden');
                editor.actionsWrapper.classList.add('hidden');

                // ...e for um exame NOVO, volta para a escolha de fluxo (Agendar/Registrar).
                if (editor.mode.value === 'new') {
                    editor.flowChoiceWrapper.classList.remove('hidden');
                } else {
                    // ...se for uma edição, reagendamento, etc., simplesmente fecha o editor.
                    resetAndCloseExamEditor();
                }
                return;
            }
            
            // Em qualquer outro caso (como estar no primeiro passo), a ação de "Voltar" fecha o editor.
            resetAndCloseExamEditor();
        });

        // Botão "X"
        if (closeExamEditorBtn) {
            closeExamEditorBtn.addEventListener('click', resetAndCloseExamEditor);
        }

        // Delegação de eventos para as ações nos itens das listas
        examListsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            const examItem = button.closest('.exam-item');
            const examId = examItem.dataset.id;

            console.log('Ação do botão clicado:', action);

            if (action === 'register-realization') {
                openEditorForRegistration(examId);
            } else if (action === 'register-result') {
                openEditorForResult(examId);
            } else if (action === 'cancel') {
                // Guarda o ID do exame a ser cancelado no próprio botão de confirmação do modal
                confirmCancelExamButton.dataset.examId = examId;
                // Mostra o novo modal de confirmação
                cancelExamConfirmModal.classList.remove('hidden');
            } else if (action === 'reschedule') {
                openEditorForReschedule(examId);
            }
        });

        // ==================================================================
        //        BLOCO DE CÓDIGO CORRIGIDO PARA O FLUXO 'NOVO EXAME'
        // ==================================================================

        // 1. Botão "Agendar" (dentro do fluxo de "Novo Exame")
        editor.flowScheduleBtn.addEventListener('click', () => {
            editor.datetimeLabel.textContent = "Agendar Para";
            editor.datetimeWrapper.classList.remove('hidden');
            editor.actionsWrapper.classList.remove('hidden');
            editor.flowChoiceWrapper.classList.add('hidden');

            // --- LÓGICA ADICIONADA ---
            if (flatpickrInstance) {
                flatpickrInstance.destroy();
            }
            // Inicializa com a configuração de AGENDAMENTO (minDate: 'today')
            flatpickrInstance = flatpickr("#exam-editor-datetime-input", configAgendamento);
        });

        // 2. Botão "Registrar Realização" (dentro do fluxo de "Novo Exame")
        editor.flowRegisterBtn.addEventListener('click', () => {
            editor.datetimeLabel.textContent = "Data e Hora da Realização";
            editor.datetimeInput.value = new Date().toISOString().slice(0, 16);
            editor.datetimeWrapper.classList.remove('hidden');
            editor.resultChoiceWrapper.classList.remove('hidden');
            editor.flowChoiceWrapper.classList.add('hidden');

            // --- LÓGICA ADICIONADA ---
            if (flatpickrInstance) {
                flatpickrInstance.destroy();
            }
            // Inicializa com a configuração de REGISTRO (maxDate: new Date()) - o seu calendário "antigo"
            flatpickrInstance = flatpickr("#exam-editor-datetime-input", configRegistro);
        });

        editor.resultYesBtn.addEventListener('click', () => {
            editor.resultTextareaWrapper.classList.remove('hidden');
            editor.actionsWrapper.classList.remove('hidden'); // Mostra Salvar/Cancelar
            editor.resultChoiceWrapper.classList.add('hidden');
            editor.resultTextarea.focus();
        });

        editor.resultNoBtn.addEventListener('click', () => {
            // Se clicou em "Não", o exame está pendente. Simulamos um clique no botão de salvar para finalizar a ação.
            editor.resultTextarea.value = ''; // Garante que não há resultado
            editor.saveBtn.click();
        });

        // FIM - LÓGICA REATORADA DO MÓDULO DE EXAMES

        // Evento de submit do formulário de login
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
                showToast('Login realizado com sucesso!');
            } catch (error) {
                console.error("Erro no login:", error);
                showToast(`Erro: ${error.message}`);
            }
        });

        // Evento de submit do formulário de cadastro
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = registerForm['register-name'].value;
            const email = registerForm['register-email'].value;
            const password = registerForm['register-password'].value;

            if (!email.endsWith('@testeficticio.com')) {
                showToast('Erro: O e-mail deve ser do domínio @testeficticio.com');
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: name });
                showToast('Conta criada com sucesso! Você será logado.');
            } catch (error) {
                console.error("Erro no cadastro:", error);
                showToast(`Erro: ${error.message}`);
            }
        });

        // Evento de clique no botão de logout com modal de confirmação
        logoutButton.addEventListener('click', () => {
            // 1. Pega os elementos do modal genérico
            const modal = document.getElementById('generic-confirm-modal');
            const title = modal.querySelector('#generic-confirm-title');
            const text = modal.querySelector('#generic-confirm-text');
            const confirmBtn = modal.querySelector('#generic-confirm-button');
            const cancelBtn = modal.querySelector('#generic-cancel-button');

            // 2. Personaliza o conteúdo do modal para a ação de "Sair"
            title.textContent = 'Confirmar Saída';
            text.textContent = 'Você tem certeza que deseja sair do sistema?';
            confirmBtn.textContent = 'Sim, Sair';
            cancelBtn.textContent = 'Cancelar';

            // 3. Usa a técnica de clonar os botões para limpar listeners antigos e evitar cliques múltiplos
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

            // 4. Define o que acontece ao clicar em "Sim, Sair"
            newConfirmBtn.onclick = async () => {
                try {
                    await signOut(auth);
                    showToast('Você saiu da sua conta.');
                    modal.classList.add('hidden'); // Esconde o modal após a ação
                } catch (error) {
                    console.error("Erro no logout:", error);
                    showToast(`Erro: ${error.message}`);
                }
            };

            // 5. Define o que acontece ao clicar em "Cancelar"
            newCancelBtn.onclick = () => {
                modal.classList.add('hidden');
            };

            // 6. Mostra o modal configurado
            modal.classList.remove('hidden');
        });

        // --- Eventos do Modal de Última Passagem ---
        if (showLastHandoverButton && lastHandoverModal) {
            showLastHandoverButton.addEventListener('click', () => {
                populateLastHandoverModal();
            });
        }
        if (closeLastHandoverModalBtn && lastHandoverModal) {
            closeLastHandoverModalBtn.addEventListener('click', () => {
                // Apenas esconde o modal, sem mexer no histórico.
                lastHandoverModal.classList.add('hidden');
            });
        }

        // Evento de clique no botão de voltar ao Painel
        backToDashboardButton.addEventListener('click', () => {
            if (hasUnsavedChanges) {
                if (!confirm('Você tem alterações não salvas. Deseja sair mesmo assim?')) {
                    return;
                }
                // Se o usuário confirmar, reseta a flag para permitir a navegação.
                hasUnsavedChanges = false;
            }
            
            // Em vez de usar history.back(), chamamos a função que controla a tela.
            // Ela já atualiza o URL para #painel e mostra a tela correta.
            showScreen('main'); 
            
            // A lista de pacientes já estará carregada devido à alteração anterior.
            // A função sortAndRenderPatientList() garante que a ordem de exibição esteja atualizada.
            sortAndRenderPatientList();

            currentPatientId = null;
            if (unsubscribeHandovers) unsubscribeHandovers();
        });

        // Navegação entre telas de login e cadastro
        document.getElementById('go-to-register').addEventListener('click', (e) => {
            e.preventDefault();
            showScreen('register');
        });
        document.getElementById('go-to-login').addEventListener('click', (e) => {
            e.preventDefault();
            showScreen('login');
        });

        // Abre/Fecha o modal de adicionar paciente
        addPatientButton.addEventListener('click', () => {
            addPatientModal.classList.remove('hidden');
            // Aplica as máscaras nos campos do modal que acabou de abrir
            applyInputMasksAndValidation();
        });
        closeModalButton.addEventListener('click', () => {
            addPatientModal.classList.add('hidden');
        });

        // Abre/Fecha o modal de resumo do paciente
        showSummaryButton.addEventListener('click', () => {
            showWeeklySummary();
        });

        closeSummaryModalButton.addEventListener('click', () => {
            patientSummaryModal.classList.add('hidden');
        });

        // Abre/Fecha o modal de editar paciente
        closeEditModalButton.addEventListener('click', () => {
            editPatientModal.classList.add('hidden');
        });

        // Fecha o modal de visualização de plantão
        closeViewHandoverModalBtn.addEventListener('click', () => {
            viewHandoverModal.classList.add('hidden');
        });

        // Adiciona um novo paciente
        addPatientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Salvando...`;

            try {
                // ALTERADO: Captura os dados do formulário em variáveis
                const newPatientFormData = {
                    name: document.getElementById('new-patient-name').value,
                    dob: document.getElementById('new-patient-dob').value,
                    patientNumber: document.getElementById('new-patient-number').value,
                    roomNumber: document.getElementById('new-patient-room').value,
                    createdAt: serverTimestamp(), // O servidor irá definir o tempo exato
                    lastUpdatedAt: serverTimestamp(), // NOVO: Importante para ordenação
                    status: 'ativo'
                };

                // ALTERADO: Pega a referência do documento recém-criado
                const docRef = await addDoc(collection(db, 'patients'), newPatientFormData);
                
                showToast('Paciente adicionado com sucesso!');
                addPatientForm.reset();
                addPatientModal.classList.add('hidden');
                showPatientDetail(docRef.id); 

                // --- INÍCIO DA SOLUÇÃO ---
                // 1. Cria um objeto local para o novo paciente
                const newPatientData = {
                    id: docRef.id,
                    ...newPatientFormData,
                    createdAt: Timestamp.now(), // Usa o tempo local para a UI
                    lastUpdatedAt: Timestamp.now() // Usa o tempo local para a UI
                };

                // 2. Adiciona o novo paciente no início da lista em memória
                currentPatientList.unshift(newPatientData);

                // 3. Re-ordena e re-desenha a lista na tela
                sortAndRenderPatientList(); 
                // --- FIM DA SOLUÇÃO ---

            } catch (error) {
                console.error("Erro ao adicionar paciente:", error);
                showToast(`Erro: ${error.message}`, 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = 'Salvar Paciente';
                setUnsavedChanges(false);
            }
        });

        // Edita um paciente
        editPatientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button[type="submit"]');
            const justification = document.getElementById('edit-patient-justification').value;

            if (!justification.trim()) {
                showToast("A justificativa é obrigatória.", "error");
                return;
            }
            
            submitButton.disabled = true;
            submitButton.innerHTML = `
                <div class="flex items-center justify-center">
                    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvando...
                </div>`;

            try {
                const patientId = document.getElementById('edit-patient-id').value;
                const correctedData = {
                    name: document.getElementById('edit-patient-name').value,
                    dob: document.getElementById('edit-patient-dob').value,
                    patientNumber: document.getElementById('edit-patient-number').value,
                    roomNumber: document.getElementById('edit-patient-room').value,
                    lastUpdatedAt: serverTimestamp() // Adiciona timestamp de atualização
                };

                const adendoData = {
                    patientId,
                    justification,
                    correctedData,
                    professionalId: currentUser.uid,
                    professionalName: currentUser.displayName,
                    timestamp: serverTimestamp()
                };

                const batch = writeBatch(db);

                // 1. Salva o adendo no histórico
                const adendoRef = doc(collection(db, 'patients', patientId, 'adendos'));
                batch.set(adendoRef, adendoData);

                // 2. Atualiza os dados principais do paciente
                const patientRef = doc(db, 'patients', patientId);
                batch.update(patientRef, correctedData);

                await batch.commit();

                showToast('Adendo salvo e dados do paciente atualizados!');
                
                // Fecha o modal de edição
                editPatientModal.classList.add('hidden');
                
                // ATUALIZA MANUALMENTE A UI SEM RECARREGAR A PÁGINA
                if (currentPatientId === patientId) {
                    // Atualiza os dados em memória
                    currentPatientData = { ...currentPatientData, ...correctedData };
                    
                    // Atualiza o cabeçalho da página de detalhes
                    patientDetailName.textContent = correctedData.name;
                    patientDetailNumber.textContent = correctedData.patientNumber;
                    patientDetailRoom.textContent = correctedData.roomNumber;
                    patientDetailAge.textContent = `${calculateAge(correctedData.dob)} anos`;

                    // Atualiza a lista de pacientes em memória para que o painel esteja correto quando você voltar
                    const patientIndex = currentPatientList.findIndex(p => p.id === patientId);
                    if (patientIndex !== -1) {
                        currentPatientList[patientIndex] = {
                            ...currentPatientList[patientIndex],
                            ...correctedData,
                            lastUpdatedAt: Timestamp.now() // Usa o tempo local para a UI
                        };
                    }
                }

            } catch (error) {
                console.error("Erro ao salvar correção:", error);
                showToast(`Erro: ${error.message}`, 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Salvar Correção';
            }
        });

        // Filtra pacientes com base na busca
        ['input', 'keyup', 'search'].forEach(evt => 
            searchPatientInput.addEventListener(evt, filterPatients)
        );
        bedFilterButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Impede que o clique feche o menu imediatamente
            bedFilterDropdown.classList.toggle('hidden');
        });

        bedFilterClearWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            clearBedSelection();
            filterPatients();
        });

        bedFilterClearButton.addEventListener('click', () => {
            clearBedSelection();
            filterPatients();
        });

        bedSearchInput.addEventListener('input', () => {
            const searchTerm = bedSearchInput.value.toLowerCase();
            const allBeds = bedFilterList.querySelectorAll('label');
            allBeds.forEach(label => {
                const bedNumber = label.textContent.toLowerCase();
                label.style.display = bedNumber.includes(searchTerm) ? 'flex' : 'none';
            });
        });

        bedFilterList.addEventListener('change', () => {
            updateBedFilterButtonState();
            filterPatients();
        });

        // --- Eventos dos Autocompletes do Formulário ---
        diagnosisInput.addEventListener('input', (e) => {
            const query = e.target.value;
            clearTimeout(debounceTimer);

            if (query.length < 3) {
                diagnosisAutocompleteList.classList.add('hidden');
                return;
            }

            debounceTimer = setTimeout(async () => {
                // ETAPA 1: Mostra o estado de carregamento imediatamente
                const onSelectCallback = (selectedValue) => {
                    const container = document.getElementById('diagnoses-tags-container');
                    container.appendChild(createListItem(selectedValue));
                    diagnosisInput.value = '';
                    updateDiagnosisSummary();
                    setUnsavedChanges(true);
                    hideActiveAutocomplete();
                };

                renderAndPositionAutocomplete(
                    diagnosisInput,
                    diagnosisAutocompleteList,
                    [],
                    query,
                    onSelectCallback,
                    'loading'
                );

                // ETAPA 2: Lógica de busca (Firestore + Gemini)
                console.log(`--- Iniciando busca inteligente para diagnóstico: "${query}" ---`);
                const directResults = await searchFirestoreCID(query, diagnosisInput, diagnosisAutocompleteList, false);
                
                let isSearchSufficient = false;
                if (directResults.length > 0) {
                    const userSearchTokens = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(' ').filter(token => token.length > 3);
                    if (userSearchTokens.length === 0) {
                        isSearchSufficient = true;
                    } else {
                        isSearchSufficient = directResults.some(result => {
                            const resultTokens = new Set(result.search_tokens_normalized);
                            return userSearchTokens.every(userToken => resultTokens.has(userToken));
                        });
                    }
                }

                let finalResults = [...directResults];
                if (!isSearchSufficient) {
                    const geminiSearchTerms = await getVertexDiagnosisSuggestion(query);

                    if (geminiSearchTerms && geminiSearchTerms.length > 0) {
                        const geminiPromises = geminiSearchTerms.map(term => searchFirestoreCID(term, diagnosisInput, diagnosisAutocompleteList, false));
                        const geminiResults = (await Promise.all(geminiPromises)).flat();
                        finalResults.push(...geminiResults);
                    }
                }
                
                const uniqueResults = [...new Map(finalResults.map(item => [item.id, item])).values()];
                const userQueryTokens = query.toLowerCase().split(' ').filter(t => t.length > 2);
                uniqueResults.forEach(result => {
                    const resultTokens = new Set(result.search_tokens_normalized);
                    let relevanceScore = 0;
                    userQueryTokens.forEach(userToken => { if (resultTokens.has(userToken)) relevanceScore++; });
                    if (result.searchable_name_normalized.startsWith(query.toLowerCase())) relevanceScore += 10;
                    result.relevanceScore = relevanceScore;
                });
                uniqueResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
                
                const finalResultNames = uniqueResults.map(r => r.name);

                // ETAPA 3: Renderiza o resultado final
                renderAndPositionAutocomplete(
                    diagnosisInput,
                    diagnosisAutocompleteList,
                    finalResultNames,
                    query,
                    onSelectCallback,
                    finalResultNames.length > 0 ? 'has_results' : 'no_results'
                );

            }, 750);
        });

        // Deleta um paciente (lógica com modal)
        deletePatientButton.addEventListener('click', () => {
            if (!currentPatientId) return;
            deleteConfirmModal.classList.remove('hidden');
        });

        const printPatientButton = document.getElementById('print-patient-button');

        printPatientButton.addEventListener('click', handlePrintSummary);

        cancelDeleteButton.addEventListener('click', () => {
            deleteConfirmModal.classList.add('hidden');
            clearHistoryState();
        });

        confirmDeleteButton.addEventListener('click', async () => {
            if (!currentPatientId || !currentUser) return;

            try {
                // Encontra o paciente na lista local para pegar o nome antes de remover
                const patientToArchive = currentPatientList.find(p => p.id === currentPatientId);
                const patientName = patientToArchive ? patientToArchive.name : 'O paciente';

                // Remove o paciente da lista de dados local
                currentPatientList = currentPatientList.filter(p => p.id !== currentPatientId);

                // Encontra o card do paciente no painel
                const patientCard = document.querySelector(`.patient-card[data-id="${currentPatientId}"], .patient-list-item[data-id="${currentPatientId}"]`);
                
                // Feedback Visual
                if (patientCard) {
                    // 1. Adiciona a classe que dispara a animação de desaparecimento
                    patientCard.classList.add('is-archiving');
                    
                    // 2. Remove o elemento do DOM APÓS a animação terminar (350ms)
                    setTimeout(() => {
                        patientCard.remove();
                    }, 350); 
                }

                deleteConfirmModal.classList.add('hidden');
                showScreen('main');
                
                // Melhora a mensagem de confirmação para ser mais específica
                showToast(`'${patientName}' foi arquivado com sucesso.`);

                // A operação no banco de dados continua em segundo plano
                const patientRef = doc(db, 'patients', currentPatientId);
                await updateDoc(patientRef, {
                    status: 'arquivado',
                    archivedAt: serverTimestamp(),
                    archivedBy: {
                        uid: currentUser.uid,
                        name: currentUser.displayName
                    }
                });

                currentPatientId = null;

            } catch (error) {
                console.error("Erro ao arquivar paciente:", error);
                showToast(`Erro ao arquivar no servidor: ${error.message}. Por favor, recarregue a página.`);
                loadInitialPatients(); 
            }
        });


        // --- INÍCIO DO BLOCO CORRIGIDO E CENTRALIZADO DE CLIQUES ---
        // Listener unificado para cliques, corrigindo remoção de tags e implementando "clicar fora".
        document.addEventListener('click', e => {
            
            /* --- LÓGICA PARA FECHAR MODAIS AO CLICAR NO FUNDO (OVERLAY) DESATIVADA ---
            const openModals = document.querySelectorAll('.fixed.inset-0.z-50:not(.hidden)');
            openModals.forEach(modal => {
                // A condição 'e.target === modal' verifica se o clique foi exatamente no elemento
                // de fundo (o overlay semi-transparente) e não em seus filhos (o conteúdo do modal).
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
            */

            // --- LÓGICA PARA FECHAR MENUS DROPDOWN AO CLICAR FORA ---
            const openDropdowns = document.querySelectorAll('.dropdown-menu:not(.hidden), #view-toggle-dropdown:not(.hidden), #bed-filter-dropdown:not(.hidden)');
            openDropdowns.forEach(dropdown => {
                // Verifica se o clique NÃO foi no próprio dropdown NEM no botão que o abre.
                const triggerButton = dropdown.previousElementSibling; // O botão que vem antes do menu
                if (!dropdown.contains(e.target) && !triggerButton.contains(e.target)) {
                    dropdown.classList.add('hidden');
                }
            });
            
            // 1. Verifica se um seletor customizado (Riscos, etc.) está aberto
            const openSelector = document.querySelector('.custom-select-options:not(.hidden)');
            if (openSelector) {
                const isClickInsideSelector = openSelector.contains(e.target);
                const isClickOnTrigger = activeSelectorInfo && activeSelectorInfo.origin.contains(e.target);

                if (!isClickInsideSelector && !isClickOnTrigger) {
                    hideActiveAutocomplete();
                }
            }

            // --- Lógica original para as outras ações (REMANESCE AQUI) ---
            if (e.target.closest('.allergy-module-box') && !e.target.closest('.remove-item-btn')) {
                return;
            }

            const addItemTrigger = e.target.closest('.add-item-trigger-btn');
            const cancelBtn = e.target.closest('.cancel-action-btn');
            const historyBtn = e.target.closest('.module-history-btn');
            const removeItemBtn = e.target.closest('.remove-item-btn');
            const clickableArea = e.target.closest('.clickable-item-area');
            const customOption = e.target.closest('.custom-select-option');

            // Ação: Clicou em qualquer lugar do módulo de Precauções para adicionar
            const precautionsModule = e.target.closest('#module-precaucoes');

            if (precautionsModule && !precautionsModule.classList.contains('module-editing')) {
                // Verifica se o clique NÃO foi em um botão que já tem ação própria
                const isClickOnInteractiveElement = e.target.closest('.add-item-trigger-btn, .cancel-action-btn, .remove-item-btn, .module-history-btn, .input-wrapper');
                
                if (!isClickOnInteractiveElement) {
                    activatePrecautionsInput(precautionsModule);
                }
            }

            // Ação: Clicou em "+ Adicionar" (Precauções/Dispositivos)
            if (addItemTrigger) {
                e.preventDefault();
                const moduleCard = addItemTrigger.closest('.bg-white.rounded-lg.shadow');
                if (moduleCard) {
                    // ALTERADO: Lógica de UI agora está aqui
                    const triggerWrapper = moduleCard.querySelector('.trigger-wrapper');
                    const cancelWrapper = moduleCard.querySelector('.cancel-action-wrapper');
                    const inputWrapper = moduleCard.querySelector('.input-wrapper');
                    const inputField = inputWrapper?.querySelector('input[type="text"]');

                    triggerWrapper?.classList.add('hidden');
                    cancelWrapper?.classList.remove('hidden');
                    inputWrapper?.classList.remove('hidden');
                    inputField?.focus();
                    
                    enterEditMode(moduleCard);
                }
                return;
            }

            // Ação: Clicou em "Cancelar"
            if (cancelBtn) {
                e.preventDefault();
                const moduleCard = cancelBtn.closest('.bg-white.rounded-lg.shadow');
                
                // NOVO: Bloco de lógica específico para o módulo de dispositivos
                if (moduleCard && moduleCard.id === 'module-dispositivos') {
                    // Itera sobre os dispositivos adicionados nesta sessão
                    devicesAddedThisSession.forEach(deviceName => {
                        // 1. Remove do array de estado principal
                        currentCustomDevices = currentCustomDevices.filter(d => d !== deviceName);

                        // 2. Remove o elemento do DOM usando o dataset que adicionamos
                        const deviceElementToRemove = moduleCard.querySelector(`.device-item-box[data-device-name="${deviceName}"]`);
                        if (deviceElementToRemove) {
                            deviceElementToRemove.remove();
                        }
                    });

                    // 3. Limpa o rastreador da sessão
                    devicesAddedThisSession = [];
                }
                
                // O código existente para fechar o modo de edição continua aqui
                if (moduleCard) {
                    const triggerWrapper = moduleCard.querySelector('.trigger-wrapper');
                    const cancelWrapper = moduleCard.querySelector('.cancel-action-wrapper');
                    const inputWrapper = moduleCard.querySelector('.input-wrapper');
                    const inputField = inputWrapper?.querySelector('input[type="text"]');

                    triggerWrapper?.classList.remove('hidden');
                    cancelWrapper?.classList.add('hidden');
                    inputWrapper?.classList.add('hidden');
                    if (inputField) inputField.value = '';
                    
                    exitEditMode(moduleCard);
                }
                checkUnsavedChanges();
                return;
            }
            
            // Ação: Clicou para ver o histórico.
            if (historyBtn) {
                e.stopPropagation();
                const moduleName = historyBtn.dataset.module;
                if (moduleName) showModuleHistory(moduleName);
                return;
            }

            // Ação: Clicou no 'x' para remover uma tag.
            if (removeItemBtn) {
                // Apenas permite a remoção se o módulo ancestral estiver em modo de edição
                if (removeItemBtn.closest('.module-editing')) {
                    // NOVO: Verifica se a tag pertence aos módulos de Riscos ou Cuidados
                    const moduleCard = removeItemBtn.closest('.module-card');
                    if (moduleCard && (moduleCard.id === 'module-riscos' || moduleCard.id === 'module-cuidados-enfermagem')) {
                        // Se pertencer a um desses módulos, impede a remoção e não faz nada.
                        return;
                    }
                    // FIM DA NOVA VERIFICAÇÃO
                    
                    e.preventDefault();
                    e.stopPropagation();

                    const tagToRemove = removeItemBtn.parentElement;
                    const container = tagToRemove.parentElement;

                    // Remove a tag do DOM
                    tagToRemove.remove();
                    setUnsavedChanges(true); // Marca que há alterações não salvas

                    // Lógica específica para o container de alergias
                    if (container.id === 'allergies-tags-container') {
                        if (container.children.length === 0) {
                            const radioNo = document.getElementById('allergy-radio-no');
                            if (radioNo) {
                                radioNo.click(); 
                            }
                        }
                        updateAllergyPlaceholder();
                    }

                    // Atualiza os sumários relevantes
                    updateDiagnosisSummary();
                    updateAllergyTitleVisibility();
                }
                return; // Finaliza a execução para este evento de clique
            }

            // Ação: Clicou em uma opção de um menu customizado
            if (customOption) {
                e.preventDefault();
                if (activeSelectorInfo) {
                    const selectedValue = customOption.dataset.value;
                    const selectedText = customOption.dataset.text;
                    const { origin, container } = activeSelectorInfo;
                    const tagContainer = origin.querySelector('.tags-display-area');
                    if (tagContainer) {
                        tagContainer.innerHTML = '';
                        const newTag = createListItem(selectedText);
                        newTag.dataset.score = selectedValue;
                        tagContainer.appendChild(newTag);
                        setUnsavedChanges(true);
                        updateAllergyPlaceholder();
                    }
                    container.classList.add('hidden');
                    origin.parentElement.appendChild(container);
                    activeSelectorInfo = null;
                }
                updateLiveScores();
                return;
            }

            // Ação 6: Clicou em uma das áreas principais de um módulo.
            if (clickableArea) {
                e.preventDefault();
                e.stopPropagation();
                
                // Caso 6a: A área é um seletor customizado (Riscos, Cuidados, Consciência).
                if (clickableArea.dataset.risk || clickableArea.dataset.fugulin || clickableArea.dataset.monitoring) {
                    
                    // Busca pelo container de opções de forma mais robusta.
                    const wrapper = clickableArea.closest('.item-section-wrapper');
                    const optionsContainer = wrapper ? wrapper.querySelector('.custom-select-options') : null;
                    const moduleCard = clickableArea.closest('.bg-white.rounded-lg.shadow');
                    if (moduleCard) {
                        enterEditMode(moduleCard);
                    }


                    if (!optionsContainer) return; // Se não encontrar o container, para a execução.

                    if (optionsContainer === openSelector) {
                        optionsContainer.classList.add('hidden');
                        if (activeSelectorInfo) activeSelectorInfo.origin.parentElement.appendChild(optionsContainer);
                        activeSelectorInfo = null;
                        return;
                    }
                    if (openSelector) {
                         openSelector.classList.add('hidden');
                         if (activeSelectorInfo) activeSelectorInfo.origin.parentElement.appendChild(openSelector);
                    }
                    
                    activeSelectorInfo = { origin: clickableArea, container: optionsContainer };
                    const type = clickableArea.dataset.risk ? 'risk' : (clickableArea.dataset.fugulin ? 'fugulin' : 'monitoring');
                    const key = clickableArea.dataset.risk || clickableArea.dataset.fugulin || clickableArea.dataset.monitoring;
                    let optionsData;
                    if (type === 'risk') optionsData = riskOptions[key];
                    else if (type === 'fugulin') optionsData = fugulinOptions[key];
                    else optionsData = monitoringOptions[key];

                    if (optionsData) {
                        optionsContainer.innerHTML = optionsData.map(opt => `<div class="custom-select-option" data-value="${typeof opt === 'string' ? opt : opt.value}" data-text="${typeof opt === 'string' ? opt : opt.text}">${typeof opt === 'string' ? opt : opt.text}</div>`).join('');
                        const rect = clickableArea.getBoundingClientRect();
                        optionsContainer.style.top = `${window.scrollY + rect.bottom + 4}px`;
                        optionsContainer.style.left = `${window.scrollX + rect.left}px`;
                        optionsContainer.style.width = `${rect.width}px`;
                        document.body.appendChild(optionsContainer);
                        positionFloatingList(clickableArea, optionsContainer);
                        optionsContainer.classList.remove('hidden');
                    }
                } 
                // Caso 6b: A área é um campo de texto simples (Diagnóstico, Comorbidades, etc.).
                else {
                    const moduleCard = clickableArea.closest('.bg-white.rounded-lg.shadow');
                    if (moduleCard) {
                        enterEditMode(moduleCard);
                        // AJUSTE AQUI: Procura o input-wrapper DENTRO da área clicada
                        const inputWrapper = clickableArea.querySelector('.input-wrapper');
                        if (inputWrapper) {
                            inputWrapper.classList.remove('hidden');
                            const inputField = inputWrapper.querySelector('input[type="text"]');
                            if (inputField) inputField.focus();
                        }
                    }
                }
                return;
            }

            // Ação: Clicou fora de um módulo em edição
            const openModule = document.querySelector('.module-editing');
            if (openModule && !e.target.closest('.module-editing')) {
                exitEditMode(openModule);
            }
        });


        /**
         * Esconde a lista de autocomplete ou seletor customizado ativo,
         * retornando-o para seu contêiner original no DOM.
         */
        function hideActiveAutocomplete() {

            // --- LOG ADICIONADO ---
            if (activeAutocomplete || document.querySelector('.custom-select-options:not(.hidden)')) {
                console.log("[DEBUG] A função hideActiveAutocomplete foi chamada.");
            }
            
            // O resto da função continua igual...
            const openSelector = document.querySelector('.custom-select-options:not(.hidden)');
            if (openSelector && activeSelectorInfo) {
                openSelector.classList.add('hidden');
                openSelector.style.position = '';
                openSelector.style.top = '';
                openSelector.style.left = '';
                openSelector.style.width = '';
                openSelector.style.zIndex = '';
                if (activeSelectorInfo.origin && activeSelectorInfo.origin.parentElement) {
                    activeSelectorInfo.origin.parentElement.appendChild(openSelector);
                }
                activeSelectorInfo = null;
            }

            if (activeAutocomplete && activeAutocomplete.listElement) {
                const { listElement } = activeAutocomplete;
                listElement.classList.add('hidden');
                if (listElement.originalParent) {
                    listElement.style.position = '';
                    listElement.style.top = '';
                    listElement.style.left = '';
                    listElement.style.width = '';
                    listElement.style.zIndex = '';
                    listElement.originalParent.appendChild(listElement);
                }
                activeAutocomplete = null;
            }
        }

        // Função para finalizar a edição de um campo de monitoramento
        function finishMonitoringInputEdit(inputElement) {
            const value = inputElement.value.trim();
            const wrapper = inputElement.closest('.clickable-item-area');
            if (!wrapper) return;

            const displayArea = wrapper.querySelector('.monitoring-display-area');

            if (displayArea) {
                displayArea.textContent = value;
                // LÓGICA DO ÍCONE DE ERRO
                if (inputElement.classList.contains('has-error')) {
                    displayArea.classList.add('has-error');
                } else {
                    displayArea.classList.remove('has-error');
                }
                displayArea.classList.remove('hidden');
            }

            inputElement.classList.add('hidden');

            if (inputElement.value !== (inputElement.dataset.originalValue || '')) {
                setUnsavedChanges(true);
                updateLiveScores();
            }
        }

        // Delegação de evento para os inputs do módulo de monitoramento
        document.getElementById('module-monitoramento').addEventListener('focusout', (e) => {
            if (e.target.classList.contains('monitoring-input')) {
                finishMonitoringInputEdit(e.target);
            }
        });

        document.getElementById('module-monitoramento').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('monitoring-input')) {
                e.preventDefault();
                finishMonitoringInputEdit(e.target);
            }
        });

        
        // --- FUNÇÕES DE DADOS ---

        /**
         * Reseta e fecha o editor de medicações, voltando ao estado inicial.
         */
        function resetAndCloseMedicationEditor() {
            medEditorArea.classList.add('hidden');
            medMainActionArea.classList.remove('hidden');
            
            // Esconde o botão de deletar
            document.getElementById('med-editor-delete-btn').classList.add('hidden');

            // Limpa todos os campos
            Object.values(medEditor).forEach(el => { if (el && el.value !== undefined) el.value = ''; });

            // Esconde todos os passos e botões
            Object.values(medSteps).forEach(el => el.classList.add('hidden'));

            // Garante que o passo 1 (informações básicas) esteja visível por padrão ao reabrir
            medSteps.step1.classList.remove('hidden');
        }

        /**
         * Controla a visibilidade dos passos dentro do editor de medicação.
         * @param {string} currentStep - O nome do passo a ser exibido.
         */
        function showMedicationEditorStep(currentStep) {
            // Esconde todos os passos (exceto o container de ações, que será controlado separadamente)
            Object.entries(medSteps).forEach(([key, element]) => {
                if (key !== 'actions') {
                    element.classList.add('hidden');
                }
            });

            // Mostra o passo atual
            if (medSteps[currentStep]) {
                medSteps[currentStep].classList.remove('hidden');
            }

            // 1. O container de ações (que tem Voltar e Salvar) aparece em todos os passos, exceto o primeiro.
            if (currentStep === 'step1') {
                medSteps.actions.classList.add('hidden');
            } else {
                medSteps.actions.classList.remove('hidden');
            }

            // 2. O botão "Salvar" só aparece nos passos finais.
            if (currentStep === 'step3b' || currentStep === 'step4') {
                medEditor.saveBtn.classList.remove('hidden');
            } else {
                medEditor.saveBtn.classList.add('hidden');
            }
        }

        /**
         * Renderiza um único item de medicação em uma das listas.
         * @param {object} medDose - O objeto da dose a ser renderizada.
         * @param {'active' | 'administered'} listType - O tipo de lista.
         * @returns {HTMLElement} - O elemento do item da lista.
         */
        function createMedicationListItem(medDoseOrGroup, listType) {
            const item = document.createElement('div');
            item.className = 'medication-list-item'; 

            if (listType === 'active') {
                const medDose = medDoseOrGroup;
                item.dataset.doseId = medDose.id;
                item.dataset.prescriptionId = medDose.prescriptionId;

                const now = new Date();
                const isOverdue = medDose.time < now;
                if (isOverdue) {
                    item.classList.add('is-overdue');
                }

                const timeString = medDose.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const dateString = medDose.time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                const formattedDose = formatDose(medDose.dose);
                
                let displayInfoHtml = '';
                if (medDose.displayInfo) {
                    // Mantém o tooltip completo e exibe apenas a frequência no card
                    const frequencyPart = medDose.displayInfo.split(',')[0];
                    displayInfoHtml = `<span class="med-info-icon" title="${medDose.displayInfo}">${frequencyPart})</span>`;
                }
                
                const timesHtml = `<li>${timeString} <span class="text-gray-400">(${dateString})</span></li>`;

                item.innerHTML = `
                    <div class="med-info-container">
                        <p class="medication-list-item-name">${medDose.name}</p>
                        <p class="medication-list-item-dose">${formattedDose}</p>
                        <p class="medication-list-item-freq">${displayInfoHtml}</p>
                        <ul class="medication-list-item-times-administered">
                            ${timesHtml}
                        </ul>
                    </div>
                    <div class="medication-list-item-actions">
                        <button type="button" class="med-action-btn text-blue-600" data-action="edit" title="Editar Prescrição">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                        </button>
                        <button type="button" class="med-action-btn text-green-600" data-action="administer" title="Administrar">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        </button>
                    </div>
                `;
            } else { // 'administered'
                const group = medDoseOrGroup;
                const representativeDose = group.doses[0];
                item.dataset.prescriptionId = representativeDose.prescriptionId;

                const countHtml = group.doses.length > 1 ? `<span class="med-dose-count">${group.doses.length}x</span>` : '';
                const formattedDose = formatDose(representativeDose.dose);

                const timesHtml = group.doses
                    .sort((a, b) => a.time.getTime() - b.time.getTime())
                    .map(d => `<li>${d.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} <span class="text-gray-400">(${d.time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})</span></li>`)
                    .join('');

                item.innerHTML = `
                    <div class="med-info-container">
                        <p class="medication-list-item-name">${countHtml} ${representativeDose.name}</p>
                        <p class="medication-list-item-dose">${formattedDose}</p>
                        <ul class="medication-list-item-times-administered">
                            ${timesHtml}
                        </ul>
                    </div>
                    <div class="medication-list-item-actions">
                        <button type="button" class="med-action-btn text-blue-600" data-action="add-dose" title="Adicionar outra dose">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
                        </button>
                        <button type="button" class="med-action-btn text-red-600" data-action="delete" title="Excluir último registro">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                `;
            }
            return item;
        }

        /**
         * Renderiza ambas as listas de medicação, gerando doses futuras a partir das prescrições.
         */
        function renderMedicationLists() {
            const activeList = document.getElementById('active-prescriptions-list');
            const administeredList = document.getElementById('administered-during-shift-list');

            activeList.innerHTML = '';
            administeredList.innerHTML = '';
            
            dosesToRender = []; 
            const administeredThisShiftIds = new Set(administeredInShift.map(d => d.id));

            activePrescriptions.forEach(p => {
                if (p.type === 'single') {
                    const dose = { ...p, id: p.prescriptionId };
                    if (!administeredThisShiftIds.has(dose.id)) {
                        dosesToRender.push(dose);
                    }
                } else if (p.type === 'continuous') {
                    const totalHours = p.duration * 24;
                    let nextDoseFound = false;
                    for (let h = 0; h < totalHours; h += p.frequency) {
                        const doseTime = new Date(p.startTime.getTime() + h * 60 * 60 * 1000);
                        const doseId = `${p.prescriptionId}_${doseTime.getTime()}`;

                        if (!administeredThisShiftIds.has(doseId) && !nextDoseFound) {
                            const remainingHours = (p.startTime.getTime() + totalHours * 60 * 60 * 1000) - doseTime.getTime();
                            const remainingDays = Math.ceil(remainingHours / (1000 * 60 * 60 * 24));
                            dosesToRender.push({
                                ...p,
                                id: doseId,
                                time: doseTime,
                                displayInfo: `(a cada ${p.frequency}h, por mais ${remainingDays} dia(s))`
                            });
                            nextDoseFound = true;
                        }
                    }
                }
            });
            
            dosesToRender.sort((a, b) => a.time.getTime() - b.time.getTime());
            dosesToRender.forEach(dose => {
                activeList.appendChild(createMedicationListItem(dose, 'active'));
            });

            const groupedAdministered = administeredInShift.reduce((acc, dose) => {
                const key = dose.prescriptionId;
                if (!acc[key]) {
                    acc[key] = { doses: [] };
                }
                acc[key].doses.push(dose);
                return acc;
            }, {});

            Object.values(groupedAdministered)
                .sort((a, b) => b.doses[0].time.getTime() - a.doses[0].time.getTime())
                .forEach(group => {
                    administeredList.appendChild(createMedicationListItem(group, 'administered'));
                });

            updateMedicationSummary();
        }

        /**
         * Abre o editor de medicações para editar uma prescrição existente.
         * @param {string} prescriptionId - O ID da prescrição a ser editada.
         */
        function openMedicationEditorForEdit(prescriptionId) {
            const allDosesForPrescription = activePrescriptions.filter(d => d.prescriptionId === prescriptionId);
            if (allDosesForPrescription.length === 0) {
                showToast("Erro: Prescrição não encontrada para edição.", "error");
                return;
            }

            // Usa a primeira dose para dados básicos e a última para calcular a duração
            const representativeDose = allDosesForPrescription[0];
            const lastDose = allDosesForPrescription[allDosesForPrescription.length - 1];

            resetAndCloseMedicationEditor();

            // Preenche o editor com dados existentes
            medEditor.id.value = prescriptionId;
            medEditor.mode.value = 'edit';
            medEditor.title.textContent = 'Editar Prescrição';
            medEditor.name.value = representativeDose.name;
            medEditor.dose.value = representativeDose.dose;

            // Mostra o botão de suspender apenas no modo de edição
            const deleteBtn = document.getElementById('med-editor-delete-btn');
            deleteBtn.classList.remove('hidden');
            deleteBtn.dataset.prescriptionId = prescriptionId; // Guarda o ID no botão

            // Mostra o editor e o passo 1
            medMainActionArea.classList.add('hidden');
            medEditorArea.classList.remove('hidden');

            // Se for dose única, vai para o passo de agendamento
            if (prescriptionId.startsWith('single')) {
                showMedicationEditorStep('step4');
                medEditor.datetimeLabel.textContent = 'Reagendar Para';
                flatpickr("#med-editor-datetime-input", { ...configAgendamento, defaultDate: representativeDose.time });
            } else { // Se for de uso contínuo
                showMedicationEditorStep('step3b');
                const now = new Date();
                const remainingDays = Math.ceil((lastDose.time.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                medEditor.frequency.value = representativeDose.frequency || '';
                medEditor.duration.value = remainingDays > 0 ? remainingDays : 1; // Mostra pelo menos 1 dia

                flatpickr("#med-editor-start-time", { ...configAgendamento, defaultDate: representativeDose.time });
            }
        }

        /**
         * Busca no Firestore por todas as doses de medicação atrasadas e a próxima dose futura
         * para todos os pacientes ativos na unidade.
         * @returns {Promise<Array>} Uma promessa que resolve para um array de objetos de medicação.
         */
        async function getUpcomingAndOverdueMedications() {
            console.log("Buscando medicações atrasadas e a próxima dose da unidade do Firestore...");
            const relevantDoses = [];
            const now = new Date();

            const activePatients = currentPatientList;

            for (const patient of activePatients) {
                if (patient.activeMedicationPrescriptions && patient.activeMedicationPrescriptions.length > 0) {
                    for (const p of patient.activeMedicationPrescriptions) {
                        const prescription = { ...p };
                        if (p.time?.toDate) prescription.time = p.time.toDate();
                        if (p.startTime?.toDate) prescription.startTime = p.startTime.toDate();

                        const allPotentialDoses = [];

                        if (prescription.type === 'single') {
                            allPotentialDoses.push({
                                ...prescription,
                                patientId: patient.id,
                                patientName: patient.name,
                                roomNumber: patient.roomNumber,
                                patientNumber: patient.patientNumber,
                                medicationName: prescription.name,
                                dose: formatDose(prescription.dose),
                                time: prescription.time
                            });
                        } else if (prescription.type === 'continuous') {
                            const totalHours = prescription.duration * 24;
                            for (let h = 0; h < totalHours; h += prescription.frequency) {
                                const doseTime = new Date(prescription.startTime.getTime() + h * 60 * 60 * 1000);
                                allPotentialDoses.push({
                                    ...prescription,
                                    patientId: patient.id,
                                    patientName: patient.name,
                                    roomNumber: patient.roomNumber,
                                    patientNumber: patient.patientNumber,
                                    medicationName: prescription.name,
                                    dose: formatDose(prescription.dose),
                                    time: doseTime,
                                });
                            }
                        }

                        // Filtra doses já administradas no plantão atual
                        const administeredInShiftIds = new Set(administeredInShift.map(d => `${d.prescriptionId}_${d.time.getTime()}`));
                        const unadministeredDoses = allPotentialDoses.filter(dose => {
                            const doseId = `${dose.prescriptionId}_${dose.time.getTime()}`;
                            return !administeredInShiftIds.has(doseId);
                        });

                        const overdue = unadministeredDoses.filter(d => d.time < now);
                        const upcoming = unadministeredDoses.filter(d => d.time >= now).sort((a, b) => a.time - b.time);
                        
                        // Adiciona todas as atrasadas
                        relevantDoses.push(...overdue);
                        
                        // Adiciona apenas a primeira próxima
                        if (upcoming.length > 0) {
                            relevantDoses.push(upcoming[0]);
                        }
                    }
                }
            }
            
            console.log(`Encontradas ${relevantDoses.length} doses relevantes (atrasadas + próximas) na unidade.`);
            return relevantDoses;
        }

        /**
         * Limpa todos os campos de entrada e exibição dentro do módulo de Monitoramento.
         */
        function resetMonitoringModule() {
            const module = document.getElementById('module-monitoramento');
            if (!module) return;

            // 1. Limpa os campos de texto de exibição
            const displayAreas = module.querySelectorAll('.monitoring-display-area');
            displayAreas.forEach(area => {
                area.textContent = '';
            });

            // 2. Limpa os valores dos inputs escondidos
            const inputFields = module.querySelectorAll('.monitoring-input');
            inputFields.forEach(input => {
                input.value = '';
            });

            // 3. Limpa a tag de seleção de Consciência
            const conscienciaContainer = document.getElementById('monitoring-consciencia-container');
            if (conscienciaContainer) {
                conscienciaContainer.innerHTML = '';
            }
            // E reseta o select escondido que pode ter sido usado para o NEWS2 (boa prática)
            const conscienciaSelect = document.getElementById('form-sv-consciencia');
            if (conscienciaSelect) {
            conscienciaSelect.value = 'A'; // Volta para o padrão 'Alerta'
            }


            // 4. Desmarca o checkbox de O₂
            const o2Checkbox = document.getElementById('form-sv-o2');
            if (o2Checkbox) {
                o2Checkbox.checked = false;
            }
            
            // 5. Garante que todas as áreas clicáveis estejam visíveis e os inputs escondidos
            module.querySelectorAll('.input-wrapper').forEach(wrapper => wrapper.classList.add('hidden'));
            module.querySelectorAll('.clickable-item-area').forEach(area => area.classList.remove('hidden'));
        }

        /**
         * Filtra o histórico de plantões e exibe as alterações de um módulo específico em um modal.
         * Exibe corretamente o histórico de Cuidados de Enfermagem.
         * Exibe os scores NEWS2 e Fugulin salvos no plantão correspondente.
         * @param {string} moduleName - O nome do módulo (ex: 'diagnostico', 'medicacoes').
         */
        function showModuleHistory(moduleName) {
            const moduleTitles = {
                diagnostico: '⚕️ Histórico de Diagnóstico e Evolução',
                precaucoes: '🛡️ Histórico de Precauções',
                riscos: '⚠️ Histórico de Riscos Assistenciais',
                medicacoes: '💉 Histórico de Medicações Administradas',
                dispositivos: '🔌 Histórico de Dispositivos',
                cuidados: '🩺 Histórico de Cuidados de Enfermagem',
                exames: '🧪 Histórico de Exames e Procedimentos',
                monitoramento: '📈 Histórico de Monitoramento',
                observacoes: '📝 Histórico de Observações Gerais',
            };

            moduleHistoryTitle.textContent = moduleTitles[moduleName] || 'Histórico do Módulo';

            if (!currentHandovers || currentHandovers.length === 0) {
                moduleHistoryContent.innerHTML = '<p class="text-center text-gray-500 italic py-4">Nenhum histórico de plantão encontrado para este paciente.</p>';
                moduleHistoryModal.classList.remove('hidden');
                return;
            }

            let historyHtml = '';
            let entryCount = 0;

            const formatChangeList = (delta, prefix = '') => {
                let log = '';
                if (delta?.added?.length) {
                    log += delta.added.map(item => `<li><span class="text-green-600 font-bold">+</span> ${prefix}: <strong>${item}</strong></li>`).join('');
                }
                if (delta?.removed?.length) {
                    log += delta.removed.map(item => `<li><span class="text-red-600 font-bold">-</span> ${prefix}: <strong>${item}</strong></li>`).join('');
                }
                return log;
            };

            currentHandovers.forEach(h => {
                const date = h.timestamp?.toDate ? h.timestamp.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data indefinida';
                const professional = h.professionalName || 'Profissional não identificado';
                let moduleEntryContent = '';
                const changes = h.changes || {};
                
                // NOVO: Bloco para adicionar scores
                let scoresHtml = '';
                if (moduleName === 'monitoramento' && h.news2?.score !== undefined) {
                    scoresHtml = `<div class="mt-2 pt-2 border-t border-dashed border-gray-200 font-mono text-xs text-gray-500"><strong>NEWS no plantão:</strong> ${h.news2.score} (${h.news2.level})</div>`;
                }
                if (moduleName === 'cuidados' && h.fugulin?.score !== undefined) {
                    scoresHtml = `<div class="mt-2 pt-2 border-t border-dashed border-gray-200 font-mono text-xs text-gray-500"><strong>Fugulin no plantão:</strong> ${h.fugulin.score} (${h.fugulin.classification})</div>`;
                }

                switch (moduleName) {
                    case 'diagnostico':
                        let diagLog = '';
                        if (changes.evolution) diagLog += `<li>📄 <strong>Evolução/Plano atualizado:</strong> "<i>${changes.evolution}</i>"</li>`;
                        diagLog += formatChangeList(changes.diagnoses, 'Diagnóstico');
                        diagLog += formatChangeList(changes.comorbidities, 'Comorbidade');
                        diagLog += formatChangeList(changes.allergies, 'Alergia');
                        if (diagLog) moduleEntryContent = `<ul class="list-none space-y-1">${diagLog}</ul>`;
                        break;

                    case 'precaucoes':
                        if (changes.precautions && (changes.precautions.added.length > 0 || changes.precautions.removed.length > 0)) {
                            moduleEntryContent = `<ul class="list-none space-y-1">${formatChangeList(changes.precautions, 'Precaução')}</ul>`;
                        }
                        break;

                    case 'riscos':
                        let riskLog = '';
                        const riskLabels = {
                            lpp: 'Risco LPP', quedas: 'Risco Quedas', bronco: 'Risco Broncoaspiração', iras: 'Risco IRAS'
                        };

                        if (changes.risks) {
                            for (const key in changes.risks) {
                                const delta = changes.risks[key];
                                // Lógica de Substituição
                                if (delta.removed?.length === 1 && delta.added?.length === 1) {
                                    riskLog += `<li>🔄 <strong>${riskLabels[key]}</strong> alterado para "<strong>${delta.added[0]}</strong>", antes estava "<s class="text-gray-500">${delta.removed[0]}</s>"</li>`;
                                } else { // Lógica para adições/remoções simples
                                    riskLog += formatChangeList(delta, riskLabels[key]);
                                }
                            }
                        }

                        if (riskLog) moduleEntryContent = `<ul class="list-none space-y-1">${riskLog}</ul>`;
                        break;
                    
                    case 'dispositivos':
                        if (changes.devices && (changes.devices.added.length > 0 || changes.devices.removed.length > 0)) {
                            moduleEntryContent = `<ul class="list-none space-y-1">${formatChangeList(changes.devices, 'Dispositivo')}</ul>`;
                        }
                        break;

                    case 'cuidados':
                        let careLog = '';
                        let itemChanged = false; // Flag para saber se um item foi alterado
                        const careLabels = {
                            cuidadoCorporal: 'Cuidado Corporal', motilidade: 'Motilidade', deambulacao: 'Deambulação',
                            alimentacao: 'Alimentação', eliminacao: 'Eliminação'
                        };

                        if (changes.nursingCare) {
                            for (const key in changes.nursingCare) {
                                const delta = changes.nursingCare[key];
                                // Lógica de Substituição: 1 item removido e 1 item adicionado
                                if (delta.removed?.length === 1 && delta.added?.length === 1) {
                                    careLog += `<li>🔄 <strong>${careLabels[key]}</strong> alterado para "<strong>${delta.added[0]}</strong>", antes estava "<s class="text-gray-500">${delta.removed[0]}</s>"</li>`;
                                    itemChanged = true;
                                } else { // Lógica para adições/remoções simples
                                    if (delta.added?.length > 0) {
                                        careLog += formatChangeList({ added: delta.added }, careLabels[key]);
                                        itemChanged = true;
                                    }
                                    if (delta.removed?.length > 0) {
                                        careLog += formatChangeList({ removed: delta.removed }, careLabels[key]);
                                        itemChanged = true;
                                    }
                                }
                            }
                        }

                        // Se NENHUM item mudou, mas o score Fugulin mudou, mostra isso.
                        // A nova condição verifica se o valor anterior não era 'N/A'
                        if (!itemChanged && changes.fugulinScoreChange && changes.fugulinScoreChange.from !== 'N/A') {
                            careLog += `<li>📊 Score Fugulin alterado de <strong>${changes.fugulinScoreChange.from}</strong> para <strong>${changes.fugulinScoreChange.to}</strong> devido a outras atualizações (ex: monitoramento, dispositivos).</li>`;
                        }

                        if (careLog) moduleEntryContent = `<ul class="list-none space-y-1">${careLog}</ul>`;
                        break;

                    case 'medicacoes':
                        let medLog = '';
                        const medChanges = h.changes?.medications || {};

                        if (medChanges.administered?.length > 0) {
                            medLog += medChanges.administered.map(m => `<li><span class="text-green-600">✓</span> Administrou <strong>${m.name} ${formatDose(m.dose)}</strong></li>`).join('');
                        }
                        if (medChanges.added?.length > 0) {
                            medLog += medChanges.added.map(m => `<li><span class="text-blue-600">+</span> Prescreveu ${formatPrescriptionForHistory(m)}</li>`).join('');
                        }
                        if (medChanges.suspended?.length > 0) {
                            medLog += medChanges.suspended.map(m => `<li><span class="text-red-600">❌</span> Suspendeu ${formatPrescriptionForHistory(m)}</li>`).join('');
                        }
                        if (medChanges.modified?.length > 0) {
                            medLog += medChanges.modified.map(m => `<li><span class="text-yellow-500">🔄</span> Modificou prescrição de ${formatPrescriptionForHistory(m)}</li>`).join('');
                        }

                        if (medLog) {
                            moduleEntryContent = `<ul class="list-none space-y-1">${medLog}</ul>`;
                        }
                        break;

                    case 'exames':
                        let examLog = '';

                        // 1. Exames FINALIZADOS (✓)
                        if (Array.isArray(h.examsDone) && h.examsDone.length > 0) {
                            examLog += h.examsDone.map(exam =>
                                `<li><span class="text-green-600" title="Finalizado">✓</span> Finalizou <strong>${exam.name}</strong> com resultado: "<i>${exam.result || 'não informado'}</i>"</li>`
                            ).join('');
                        }

                        // 2. Exames REAGENDADOS (🔄)
                        if (Array.isArray(h.rescheduledExams) && h.rescheduledExams.length > 0) {
                            examLog += h.rescheduledExams.map(exam => 
                                `<li><span title="Reagendado">🔄</span> Reagendou <strong>${exam.name}</strong> de <s class="text-gray-500">${formatDate(exam.oldTimestamp)}</s> para <strong>${formatDate(exam.newTimestamp)}</strong></li>`
                            ).join('');
                        }
                        
                        // // 3. Exames AGENDADOS (📅) e CANCELADOS (❌)
                        if (changes.scheduledExams) {
                            if (changes.scheduledExams?.added?.length > 0) {
                                examLog += changes.scheduledExams.added.map(examObj =>
                                    `<li><span title="Agendado">📅</span> Agendou: <strong>${examObj.name}</strong> para ${formatDate(examObj.timestamp)}</li>`
                                ).join('');
                            }
                            if (changes.scheduledExams?.removed?.length > 0) {
                                examLog += changes.scheduledExams.removed.map(examObj =>
                                    `<li><span class="text-red-600" title="Cancelado">❌</span> Cancelou Agendamento: <strong>${examObj.name}</strong></li>`
                                ).join('');
                            }
                        }

                        // 4. Exames REALIZADOS (🔬) e CANCELADOS PENDENTES (❌)
                        if (changes.pendingExams) {
                            if (changes.pendingExams?.added?.length > 0) {
                                examLog += changes.pendingExams.added.map(examObj =>
                                    `<li><span title="Realizado">🔬</span> Realizou: <strong>${examObj.name}</strong> em ${formatDate(examObj.timestamp)} (aguardando resultado)</li>`
                                ).join('');
                            }
                            if (changes.pendingExams.removed?.length > 0) {
                                examLog += changes.pendingExams.removed.map(examObj =>
                                    `<li><span class="text-red-600" title="Cancelado">❌</span> Cancelou Exame Pendente: <strong>${examObj.name}</strong></li>`
                                ).join('');
                            }
                        }

                        // Se qualquer uma das condições acima produziu um log, preenche o conteúdo
                        if (examLog) {
                            moduleEntryContent = `<ul class="list-none space-y-1">${examLog}</ul>`;
                        }
                        break;

                    case 'monitoramento':
                        if (h.monitoring && Object.values(h.monitoring).some(v => v)) {
                            const vitals = Object.entries(h.monitoring).filter(([_, val]) => val).map(([key, val]) => `${key.toUpperCase()}: <strong>${val}</strong>`).join(' | ');
                            if (vitals) moduleEntryContent = `<p class="font-mono text-sm">${vitals}</p>`;
                        }
                        break;

                    case 'observacoes':
                        if (changes.pendingObs) {
                            moduleEntryContent = `<p class="italic">"<strong>${changes.pendingObs}</strong>"</p>`;
                        }
                        break;
                }

                if ((moduleEntryContent && moduleEntryContent.replace(/<[^>]*>/g, '').trim() !== '') || scoresHtml) {
                    entryCount++;
                    historyHtml += `
                        <div class="p-3 border rounded-md bg-gray-50">
                            <p class="text-xs text-gray-500">Em ${date} por <strong>${professional}</strong></p>
                            <div class="mt-1 text-sm text-gray-800">${moduleEntryContent || ''}${scoresHtml}</div>
                        </div>
                    `;
                }
            });

            if (entryCount === 0) {
                historyHtml = '<p class="text-center text-gray-500 italic py-4">Nenhuma alteração registrada para este módulo no histórico.</p>';
            }

            moduleHistoryContent.innerHTML = historyHtml;
            moduleHistoryModal.classList.remove('hidden'); // Garante que o modal apareça no final
        }

        function calculateAge(dobString) {
            if (!dobString) return '?';
            const birthDate = new Date(dobString);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return age;
        }

        /**
         * Formata a descrição de uma prescrição para exibição em históricos.
         * @param {object} med - O objeto da prescrição.
         * @returns {string} - A string HTML formatada.
         */
        function formatPrescriptionForHistory(med) {
            let details = `<strong>${med.name} ${formatDose(med.dose)}</strong>`;
            if (med.type === 'continuous' && med.frequency && med.duration) {
                details += ` (a cada ${med.frequency}h por ${med.duration} dia(s))`;
            }
            return details;
        }

        /**
         * Formata um timestamp (número ou objeto do Firestore) para uma string legível (DD/MM HH:mm).
         * @param {object|number|null} timestamp - O timestamp a ser formatado.
         * @returns {string} - A data e hora formatadas, ou uma string padrão se a data for inválida.
         */
        function formatDate(timestamp) {
            if (!timestamp) return 'Data não especificada';

            try {
                // Converte o timestamp para um objeto Date, seja ele um número ou um objeto do Firestore
                const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                
                // Verifica se a data resultante é válida
                if (isNaN(date.getTime())) {
                    return 'Data inválida';
                }

                return date.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                console.error("Erro ao formatar data:", error);
                return 'Erro na data';
            }
        }

        /**
         * Compara duas listas de objetos de exame (baseado em seus IDs) e retorna o que foi adicionado e removido.
         * @param {Array<object>} originalExams - A lista de exames antes da edição.
         * @param {Array<object>} currentExams - A lista de exames após a edição.
         * @returns {{added: Array<object>, removed: Array<object>}}
         */
        function calculateDeltaForExams(originalExams = [], currentExams = []) {
            const originalIdSet = new Set(originalExams.map(exam => exam.id));
            const currentIdSet = new Set(currentExams.map(exam => exam.id));

            const added = currentExams.filter(exam => !originalIdSet.has(exam.id));
            const removed = originalExams.filter(exam => !currentIdSet.has(exam.id));

            return { added, removed };
        }


        /**
         * Calcula o score NEWS2 com base nos parâmetros fisiológicos.
         * @param {object} vitals - Objeto contendo os sinais vitais.
         * @returns {object} - Objeto com o score total, o nível de risco e o status do O2.
         */
        function calculateNEWS2(vitals) {
            let score = 0;
            const { fr, satO2, o2Supplement, pa, fc, consciencia, temp } = vitals;

            // Se o valor não for um número válido, a condição será falsa e não pontuará.
            // 1. Frequência Respiratória (FR)
            if (!isNaN(fr)) {
                if (fr <= 8) score += 3;
                else if (fr >= 9 && fr <= 11) score += 1;
                else if (fr >= 21 && fr <= 24) score += 2;
                else if (fr >= 25) score += 3;
            }

            // 2. Saturação de Oxigênio (SatO2)
            if (!isNaN(satO2)) {
                if (satO2 <= 91) score += 3;
                else if (satO2 >= 92 && satO2 <= 93) score += 2;
                else if (satO2 >= 94 && satO2 <= 95) score += 1;
            }
            
            // 3. O₂ Suplementar
            if (o2Supplement) score += 2;

            // 4. Pressão Arterial Sistólica (PAS)
            if (!isNaN(pa)) {
                if (pa <= 90) score += 3;
                else if (pa >= 91 && pa <= 100) score += 2;
                else if (pa >= 101 && pa <= 110) score += 1;
                else if (pa >= 220) score += 3;
            }

            // 5. Frequência Cardíaca (FC)
            if (!isNaN(fc)) {
                if (fc <= 40) score += 3;
                else if (fc >= 41 && fc <= 50) score += 1;
                else if (fc >= 91 && fc <= 110) score += 1;
                else if (fc >= 111 && fc <= 130) score += 2;
                else if (fc >= 131) score += 3;
            }

            // 6. Nível de Consciência
            if (consciencia !== 'A') score += 3;

            // 7. Temperatura
            if (!isNaN(temp)) {
                if (temp <= 35.0) score += 3;
                else if (temp >= 35.1 && temp <= 36.0) score += 1;
                else if (temp >= 38.1 && temp <= 39.0) score += 1;
                else if (temp >= 39.1) score += 2;
            }

            // Determinar o nível de risco
            let level = 'Risco Baixo';
            if (score >= 7) {
                level = 'Risco Alto';
            } else if (score >= 5) {
                level = 'Risco Médio';
            } else if (score >= 1 && score <= 4) {
                const hasIndividualScoreOf3 = [
                    fr <= 8 || fr >= 25,
                    satO2 <= 91,
                    pa <= 90 || pa >= 220,
                    fc <= 40 || fc >= 131,
                    consciencia !== 'A',
                    temp <= 35.0
                ].some(condition => condition);
                
                // Eleva para 'Risco Médio' se um parâmetro individual pontuar 3, 
                // OU se o score total for 3 ou 4 E o paciente estiver em uso de O2.
                if (hasIndividualScoreOf3 || (score >= 3 && o2Supplement)) {
                    level = 'Risco Médio';
                } else {
                    level = 'Risco Baixo-Médio';
                }
            }
            
            // Retorna também o status do O2, que é usado no cálculo do Fugulin.
            return { score: score, level: level, o2Supplement: o2Supplement };
        }

        /**
         * Coleta os dados vitais completos, mesclando dados do formulário com o estado anterior.
         * @returns {object} - Um objeto completo com todos os dados brutos para cálculo e salvamento.
         */
        function getFinalVitalsData() {
            const lastMonitoring = originalPatientState.monitoring || {};
            
            const getValue = (inputId, fallbackKey) => {
                const input = document.getElementById(inputId);
                return input && input.value.trim() !== '' ? input.value.trim() : (lastMonitoring[fallbackKey] || '');
            };

            let finalConsciencia = 'A'; // Padrão
            let finalConscienciaText = 'Alerta (A)'; // Padrão
            const conscienciaTag = document.querySelector('#monitoring-consciencia-container .item-text');

            if (conscienciaTag) {
                finalConsciencia = conscienciaTag.dataset.score;
                finalConscienciaText = conscienciaTag.dataset.value;
            } else if (lastMonitoring.consciencia && lastMonitoring.consciencia.length > 0) {
                const option = monitoringOptions.consciencia.find(opt => opt.text === lastMonitoring.consciencia[0]);
                if(option) {
                    finalConsciencia = option.value;
                    finalConscienciaText = option.text;
                }
            }
            
            const paValue = getValue('form-sv-pa', 'pa');

            return {
                fr: parseInt(getValue('form-sv-fr', 'fr'), 10),
                satO2: parseInt(getValue('form-sv-sato2', 'sato2'), 10),
                o2Supplement: document.getElementById('form-sv-o2').checked,
                pa: paValue ? parseInt(paValue.split('/')[0], 10) : NaN,
                paString: paValue, // Retorna o texto original "120/80"
                fc: parseInt(getValue('form-sv-fc', 'fc'), 10),
                consciencia: finalConsciencia, // Retorna a letra 'A', 'V', 'P', 'U'
                conscienciaText: finalConscienciaText, // Retorna o texto completo "Alerta (A)"
                temp: parseFloat((getValue('form-sv-temp', 'temp') || '').replace(',', '.')),
                hgt: getValue('form-sv-hgt', 'hgt'),
                others: getValue('form-sv-others', 'others')
            };
        }

        /**
         * Calcula o score e a classificação de Fugulin com base em 9 áreas de cuidado,
         * sendo 5 avaliadas diretamente e 4 estimadas a partir de outros dados.
         * @param {object} params - Objeto com dados do paciente e do formulário.
         * @returns {object} - Objeto com o score total e a classificação.
         */
        function calculateFugulin(params) {
            const {
                news2, dispositivos, medicamentos, consciencia,
                cuidadoCorporal, motilidade, deambulacao, alimentacao, eliminacao
            } = params;
            
            let score = 0;

            // --- Parte 1: 5 Áreas de Cuidado avaliadas diretamente ---
            score += parseInt(cuidadoCorporal, 10) || 1;
            score += parseInt(motilidade, 10) || 1;
            score += parseInt(deambulacao, 10) || 1;
            score += parseInt(alimentacao, 10) || 1;
            score += parseInt(eliminacao, 10) || 1;

            // --- Parte 2: 4 Áreas estimadas a partir de outros dados ---
            
            // 2.1 Estado Mental
            const scoreEstadoMental = (consciencia === 'A') ? 1 : 4;
            score += scoreEstadoMental;

            // 2.2 Oxigenação
            let scoreOxigenacao = 1;
            if (news2.o2Supplement) scoreOxigenacao = 3;
            else if (news2.fr > 20 || news2.satO2 < 95) scoreOxigenacao = 2;
            score += scoreOxigenacao;

            // 2.3 Sinais Vitais
            let scoreSinaisVitais = 1;
            if (news2.score >= 5) scoreSinaisVitais = 3; // Risco Médio/Alto
            else if (news2.score >= 1) scoreSinaisVitais = 2; // Risco Baixo-Médio
            score += scoreSinaisVitais;

            // 2.4 Terapêutica
            let scoreTerapeutica = 1;
            if (dispositivos.includes('CVC') || dispositivos.includes('PICC') || dispositivos.length > 2 || medicamentos.length > 5) scoreTerapeutica = 4;
            else if (dispositivos.length > 0) scoreTerapeutica = 3;
            else if (medicamentos.some(m => m.name.toLowerCase().includes('injetável'))) scoreTerapeutica = 2;
            score += scoreTerapeutica;

            // --- Classificação Final ---
            let classification = 'Não Classificado';
            if (score >= 9 && score <= 12) classification = 'Cuidados Mínimos';
            else if (score >= 13 && score <= 18) classification = 'Cuidados Intermediários';
            else if (score >= 19 && score <= 24) classification = 'Cuidados de Alta Dependência';
            else if (score >= 25 && score <= 30) classification = 'Cuidados Semi-Intensivos';
            else if (score >= 31) classification = 'Cuidados Intensivos';
            
            return { score, classification };
        }

        /**
         * [VERSÃO CORRIGIDA]
         * Coleta os dados do formulário (com fallback para os dados antigos),
         * calcula os escores NEWS2 e Fugulin em tempo real e atualiza a UI.
         */
        function updateLiveScores() {
            const news2Display = document.getElementById('live-news2-score');
            const fugulinDisplay = document.getElementById('live-fugulin-score');
            if (!news2Display || !fugulinDisplay) return;

            // 1. Usa a nova função unificada para obter os dados vitais completos.
            const finalVitals = getFinalVitalsData();
            const news2Result = calculateNEWS2(finalVitals);

            // 2. Atualiza o display do NEWS2 se houver um score.
            if (news2Result.score > 0) {
                news2Display.textContent = `NEWS: ${news2Result.score}`;
            } else {
                news2Display.textContent = '';
            }

            // 3. Coleta os outros dados necessários para o Fugulin.
            const fugulinData = {
                news2: news2Result,
                dispositivos: Array.from(document.querySelectorAll('#dispositivos-grid input[type="checkbox"]:checked')).map(chk => chk.value),
                medicamentos: activePrescriptions,
                consciencia: finalVitals.consciencia,
                cuidadoCorporal: getFugulinScoreFromDOMorState('cuidadoCorporal'),
                motilidade:     getFugulinScoreFromDOMorState('motilidade'),
                deambulacao:    getFugulinScoreFromDOMorState('deambulacao'),
                alimentacao:    getFugulinScoreFromDOMorState('alimentacao'),
                eliminacao:     getFugulinScoreFromDOMorState('eliminacao')
            };

            // 4. Calcula e exibe o Fugulin.
            const fugulinResult = calculateFugulin(fugulinData);
            fugulinDisplay.textContent = `Fugulin: ${fugulinResult.score}`;
        }


        function renderExamHistory(handovers) {
            const examHistoryList = document.getElementById('exam-history-list');
            examHistoryList.innerHTML = '';
            const examEvents = [];

            // Itera em todos os plantões para coletar os eventos de exame
            [...handovers].reverse().forEach(h => { // .reverse() para começar do mais antigo
                const timestamp = h.timestamp?.toDate ? h.timestamp.toDate() : new Date();

                // 1. Coleta exames realizados
                if (h.examsDone && h.examsDone.trim() !== '') {
                    examEvents.push({
                        type: 'Realizado',
                        text: h.examsDone,
                        timestamp: timestamp
                    });
                }
                // 2. Coleta resultados de exames pendentes
                if (h.changes?.pendingExams?.resolved && Object.keys(h.changes.pendingExams.resolved).length > 0) {
                    Object.entries(h.changes.pendingExams.resolved).forEach(([exam, result]) => {
                        examEvents.push({
                            type: 'Resultado',
                            text: `<strong>${exam}:</strong> ${result}`,
                            timestamp: timestamp
                        });
                    });
                }
            });

            if (examEvents.length === 0) {
                examHistoryList.innerHTML = '<p class="italic text-gray-500">Nenhum exame realizado ou resultado liberado no histórico.</p>';
                return;
            }

            // Renderiza os eventos no HTML
            let html = '<ul class="space-y-2">';
            examEvents.forEach(event => {
                const formattedDate = event.timestamp.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const badgeClass = event.type === 'Resultado' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800';
                
                html += `
                    <li class="border-b border-gray-200 pb-2">
                        <div class="flex justify-between items-center text-xs text-gray-500 mb-1">
                            <span>${formattedDate}</span>
                            <span class="font-semibold px-2 py-0.5 rounded-full ${badgeClass}">${event.type}</span>
                        </div>
                        <p class="text-gray-800">${event.text}</p>
                    </li>
                `;
            });
            html += '</ul>';
            examHistoryList.innerHTML = html;
        }

        function populateBedFilter(beds) {
            bedFilterList.innerHTML = '';
            if (beds.length === 0) {
                bedFilterList.innerHTML = '<p class="text-xs text-center text-gray-500 p-2">Nenhum leito ocupado.</p>';
                return;
            }
            beds.forEach(bed => {
                const label = document.createElement('label');
                label.className = 'flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 cursor-pointer';
                label.innerHTML = `<input type="checkbox" value="${bed}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><span class="text-sm text-gray-700">${bed}</span>`;
                bedFilterList.appendChild(label);
            });
        }

        function updateBedFilterButtonState() {
            const selectedCount = bedFilterList.querySelectorAll('input:checked').length;
            if (selectedCount === 0) {
                bedFilterButtonText.textContent = 'Buscar por Leito';
                bedFilterClearWrapper.classList.add('hidden');
                bedFilterArrowIcon.classList.remove('hidden');
            } else {
                bedFilterButtonText.textContent = `${selectedCount} leito(s) selecionado(s)`;
                bedFilterClearWrapper.classList.remove('hidden');
                bedFilterArrowIcon.classList.add('hidden');
            }
        }

        function clearBedSelection() {
            bedFilterList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            bedSearchInput.value = '';
            bedFilterList.querySelectorAll('label').forEach(label => label.style.display = 'flex');
            updateBedFilterButtonState();
        }

        function calculateDelta(original = [], current = []) {
            const originalSet = new Set(original);
            const currentSet = new Set(current);
            return {
                added: current.filter(item => !originalSet.has(item)),
                removed: original.filter(item => !currentSet.has(item))
            };
        }

        function createListItemElement(text, options = {}) {
            const item = document.createElement('span');
            // A classe 'item-text' será usada para estilização via CSS
            item.className = 'item-text'; 
            item.dataset.value = text;
            item.textContent = text;

            const removeBtn = document.createElement('span');
            // A classe do botão de remoção é a mesma, mas adicionamos 'hidden' do Tailwind
            removeBtn.className = 'tag-remove hidden'; 
            removeBtn.innerHTML = '&times;';
            // Adicionamos o botão dentro do span para manipulação futura
            item.appendChild(removeBtn);

            return item;
        }

        function renderItemsAsList(containerId, items) {
            const container = document.getElementById(containerId);
            if (!container) {
                console.warn(`[renderItemsAsList] Aviso: Contêiner com ID #${containerId} não foi encontrado.`);
                return;
            }
            
            container.innerHTML = ''; // Apenas limpa o conteúdo

            if (items && Array.isArray(items) && items.length > 0) {
                items.forEach(text => {
                    if (typeof text === 'string' && text.trim() !== '') {
                        const tagElement = createListItem(text);
                        container.appendChild(tagElement);
                    }
                });
            }
        }

        function getItemsFromContainer(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return []; // Segurança para caso o container não exista

            // Agora, como o elemento com a classe .item-text é o mesmo que tem o data-value, isto vai funcionar.
            return Array.from(container.querySelectorAll('.item-text'))
                .map(item => item.dataset.value);
        }


        // Variável global para rastrear a lista de autocomplete ativa
        let activeAutocomplete = null;

        /**
         * FUNÇÃO UNIFICADA E ROBUSTA
         * Pega o SCORE NUMÉRICO de um item de cuidado, buscando primeiro no formulário (DOM)
         * e, se não encontrar, busca no estado original do paciente.
         * @param {string} key - A chave do cuidado (ex: 'cuidadoCorporal').
         * @returns {string} - O score numérico correspondente (ex: '1', '2', '3', '4').
         */
        function getFugulinScoreFromDOMorState(key) {
            const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            const container = document.getElementById(`fugulin-${kebabKey}-container`);
            const tag = container ? container.querySelector('[data-score]') : null;

            // 1. Se o usuário selecionou algo no formulário, usa o score da tag.
            if (tag) {
                return tag.dataset.score;
            }
            
            // 2. Se não, busca o valor de texto original do paciente.
            const originalCareText = (originalPatientState.nursingCare?.[key] || [])[0];
            if (originalCareText) {
                // Encontra a opção correspondente nos dados para obter o score numérico.
                const option = fugulinOptions[key].find(opt => opt.text === originalCareText);
                if (option) return option.value;
            }
            
            // 3. Fallback final para o valor mínimo se nada for encontrado.
            return '1';
        }

        /**
         * [VERSÃO MODIFICADA COM LOGS]
         * Renderiza e posiciona a lista de autocomplete, agora com suporte a estados de carregamento e "nenhum resultado".
         * @param {HTMLInputElement} inputElement - O input que acionou a lista.
         * @param {HTMLDivElement} listElement - O elemento <div> da lista.
         * @param {string[]} suggestions - As sugestões a serem exibidas.
         * @param {string} customValue - O valor que o usuário digitou.
         * @param {Function} onSelectCallback - A função a ser chamada quando um item é selecionado.
         * @param {'has_results' | 'loading' | 'no_results'} state - O estado atual da busca.
         */
        function renderAndPositionAutocomplete(inputElement, listElement, suggestions, customValue, onSelectCallback, state = 'has_results') {
            hideActiveAutocomplete();

            if (!listElement.originalParent) {
                listElement.originalParent = listElement.parentElement;
            }
            document.body.appendChild(listElement);
            listElement.innerHTML = '';

            // Renderiza a opção "Usar este texto" se aplicável
            if (state !== 'no_results' && customValue) {
                const customItem = document.createElement('div');
                customItem.className = 'autocomplete-item cursor-pointer p-3 hover:bg-gray-100 border-b border-dashed';
                customItem.innerHTML = `<p class="font-semibold text-gray-800">${customValue}</p><p class="text-xs text-gray-500">Usar este texto</p>`;
                customItem.addEventListener('click', () => onSelectCallback(customValue));
                listElement.appendChild(customItem);
            }

            // Renderiza os diferentes estados da lista (carregando, sem resultados, com resultados)
            if (state === 'loading') {
                const loadingItem = document.createElement('div');
                loadingItem.className = 'p-4 text-center';
                loadingItem.innerHTML = `
                    <svg class="animate-spin h-6 w-6 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="mt-2 text-sm text-gray-500">Buscando sugestões...</p>
                `;
                listElement.appendChild(loadingItem);
            } else if (state === 'no_results') {
                const noResultsItem = document.createElement('div');
                noResultsItem.className = 'p-3 text-center text-sm text-gray-500 italic';
                noResultsItem.textContent = 'Nenhuma sugestão encontrada.';
                listElement.appendChild(noResultsItem);
            } else {
                suggestions.forEach(suggestion => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item cursor-pointer p-3 hover:bg-gray-100';
                    item.textContent = suggestion;
                    item.addEventListener('click', () => onSelectCallback(suggestion));
                    listElement.appendChild(item);
                });
            }

            // Posiciona e exibe a lista
            positionFloatingList(inputElement, listElement);
            listElement.classList.remove('hidden');
            activeAutocomplete = { listElement, inputElement };
            
            // Variável para controlar se o rato está sobre a lista
            let isMouseOverList = false;

            listElement.addEventListener('mouseenter', () => {
                isMouseOverList = true;
            });
            listElement.addEventListener('mouseleave', () => {
                isMouseOverList = false;
            });

            // O evento 'blur' é uma alternativa mais fiável ao 'focusout' neste contexto.
            // Ele é acionado quando o elemento perde o foco.
            const handleBlur = () => {
                // Damos uma pequeníssima janela de tempo (50ms) antes de fechar.
                // Se, nesse tempo, o rato entrar na lista (o que acontece ao clicar na scrollbar),
                // a flag 'isMouseOverList' será 'true' e o fecho é cancelado.
                setTimeout(() => {
                    if (!isMouseOverList) {
                        hideActiveAutocomplete();
                    }
                }, 50);
            };

            // Usamos { once: true } para garantir que este listener seja adicionado apenas uma vez por cada abertura da lista,
            // evitando acumulação de listeners no mesmo elemento.
            inputElement.addEventListener('blur', handleBlur, { once: true });
        }

        /**
         * Posiciona uma lista flutuante de forma absoluta na página, abaixo de um elemento de referência,
         * permitindo que ela acompanhe a rolagem.
         * @param {HTMLElement} triggerElement - O elemento que acionou a lista (input, botão, etc.).
         * @param {HTMLElement} listElement - O elemento da lista a ser posicionado.
         */
        function positionFloatingList(triggerElement, listElement) {
            if (!listElement.originalParent) {
                listElement.originalParent = listElement.parentElement;
            }
            document.body.appendChild(listElement);

            const rect = triggerElement.getBoundingClientRect();

            listElement.style.position = 'absolute';
            // O cálculo do 'top' agora SOMA a posição de rolagem da janela
            listElement.style.top = `${rect.bottom + window.scrollY + 4}px`; // 4px de espaço
            listElement.style.left = `${rect.left + window.scrollX}px`;
            listElement.style.width = `${rect.width}px`;
            listElement.style.zIndex = '10000';
        }

        /**
         * Chama a API do Gemini para obter sugestões de termos de busca formais da CID-10
         * a partir de uma consulta em linguagem natural.
         * VERSÃO OTIMIZADA COM CACHE.
         * @param {string} userQuery - O termo digitado pelo usuário (ex: "cancer").
         * @returns {Promise<string[]>} - Uma promessa que resolve para um array de termos de busca sugeridos.
         */
        
        // Cria o cache fora da função para que ele persista entre as chamadas
        const geminiCache = new Map();

        /**
         * Chama a Cloud Function para obter sugestões de diagnóstico.
         */
        async function getVertexDiagnosisSuggestion(userQuery) {
            const getSuggestion = httpsCallable(functions, 'getVertexDiagnosisSuggestion');
            try {
                const result = await getSuggestion({ query: userQuery });
                return result.data.suggestions || [];
            } catch (error) {
                console.error("Erro ao chamar a Cloud Function de diagnóstico:", error);
                return [];
            }
        }

        /**
         * Chama a Cloud Function para obter sugestões de medicamentos.
         */
        async function getVertexMedicationSuggestion(userQuery) {
            const getSuggestion = httpsCallable(functions, 'getVertexMedicationSuggestion');
            try {
                const result = await getSuggestion({ query: userQuery });
                return result.data.suggestions || [];
            } catch (error) {
                console.error("Erro ao chamar a Cloud Function de medicamentos:", error);
                return [];
            }
        }

        /**
         * Chama a Cloud Function para processar a passagem de plantão por voz.
         */
        async function getStructuredDataFromVoice(text) {
            const processVoice = httpsCallable(functions, 'getStructuredDataFromVoice');
            try {
                const result = await processVoice({ text: text });
                return result.data.data || null;
            } catch (error) {
                console.error("Erro ao chamar a Cloud Function de voz:", error);
                alert("Ocorreu um erro ao tentar extrair as informações. Verifique o console.");
                return null;
            }
        }

        /**
         * Busca por prefixo e tokens, classifica os resultados por relevância e os exibe.
         * @param {string} queryText - O texto a ser pesquisado.
         * @param {HTMLElement} inputElement - O elemento de input que originou a busca.
         * @param {HTMLElement} listElement - O elemento da lista onde renderizar.
         * @param {boolean} [renderUI=true] - Se deve renderizar o autocomplete ou apenas retornar os dados.
         * @returns {Promise<object[]>} - Uma promessa que resolve para um array de objetos de resultado completos.
         */
        async function searchFirestoreCID(queryText, inputElement, listElement, renderUI = true) {
            const normalizedQuery = queryText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normalizedQuery.length < 2) {
                if (renderUI) listElement.classList.add('hidden');
                return [];
            }

            const diagnosesRef = collection(db, 'diagnoses');
            const searchTokens = normalizedQuery.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(' ').filter(token => token);

            // Otimização: Se a busca tiver poucas palavras, podemos combinar as buscas.
            const prefixQuery = query(diagnosesRef, where('searchable_name_normalized', '>=', normalizedQuery), where('searchable_name_normalized', '<=', normalizedQuery + '\uf8ff'), limit(10));
            const tokenQuery = query(diagnosesRef, where('search_tokens_normalized', 'array-contains-any', searchTokens), limit(10));

            try {
                const [prefixSnapshot, tokenSnapshot] = await Promise.all([getDocs(prefixQuery), getDocs(tokenQuery)]);
                const resultsMap = new Map();

                prefixSnapshot.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                tokenSnapshot.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));

                const combinedResults = Array.from(resultsMap.values());

                // --- INÍCIO DA LÓGICA DE RANQUEAMENTO ---
                const rankedResults = combinedResults.map(result => {
                    let score = 0;
                    const resultTokens = new Set(result.search_tokens_normalized || []);
                    const resultNameNormalized = result.searchable_name_normalized || '';

                    // Prioridade alta para correspondência exata do início da frase
                    if (resultNameNormalized.startsWith(normalizedQuery)) {
                        score += 100;
                    }

                    // A pontuação principal agora vem da contagem de tokens correspondentes
                    let matchingTokensCount = 0;
                    searchTokens.forEach(searchToken => {
                        if (resultTokens.has(searchToken)) {
                            matchingTokensCount++;
                        }
                    });

                    // Pontuação exponencial para valorizar múltiplos acertos.
                    // 1 token = 50 pts, 2 tokens = 200 pts, 3 tokens = 450 pts.
                    // Isso garante que "neoplasia ... mama" (2 acertos) sempre venha antes de "neoplasia ..." (1 acerto).
                    score += matchingTokensCount * matchingTokensCount * 50;

                    // Bônus adicional se TODOS os tokens da busca estiverem presentes no resultado
                    if (matchingTokensCount > 0 && matchingTokensCount === searchTokens.length) {
                        score += 50;
                    }

                    // Penalidade para resultados que têm muitos tokens extras não relacionados
                    const extraTokens = resultTokens.size - matchingTokensCount;
                    score -= extraTokens * 5;

                    // Pequena penalidade pelo comprimento para servir como desempate
                    score -= result.name.length * 0.01;

                    return { ...result, score };
                });

                rankedResults.sort((a, b) => b.score - a.score);

                if (renderUI) {
                    const finalSuggestions = rankedResults.slice(0, 10).map(r => r.name);
                    const onSelectCallback = (selectedValue) => {
                        const containerId = (inputElement.id === 'form-diagnosis') 
                            ? 'diagnoses-tags-container' 
                            : 'comorbidities-tags-container';

                        const container = document.getElementById(containerId);

                        if (container) {
                            container.appendChild(createListItem(selectedValue));
                            inputElement.value = '';
                            updateDiagnosisSummary();
                            setUnsavedChanges(true);
                        }
                    };
                    renderAndPositionAutocomplete(inputElement, listElement, finalSuggestions, queryText, onSelectCallback);
                }

                return rankedResults;

            } catch (error) {
                console.error("Erro na busca de diagnósticos:", error);
                if (renderUI) showToast("Erro ao buscar diagnósticos.", "error");
                return [];
            }
        }

        /**
         * Busca por medicações no Firestore com ranking de relevância e limite de 10 sugestões.
         * Pode renderizar a UI ou apenas retornar os resultados.
         * @param {string} queryText - O texto a ser pesquisado.
         * @param {HTMLElement} inputElement - O elemento de input que originou a busca.
         * @param {HTMLElement} listElement - O elemento da lista onde renderizar.
         * @param {boolean} [renderUI=true] - Se deve renderizar o autocomplete ou apenas retornar os dados.
         * @returns {Promise<string[]>} - Uma promessa que resolve para um array de nomes de medicamentos ordenado por relevância.
         */
        async function fetchMedicationSuggestions(queryText, inputElement, listElement, renderUI = true) {
            const normalizedQuery = queryText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normalizedQuery.length < 2) {
                if (renderUI) listElement.classList.add('hidden');
                return [];
            }

            const medicationsRef = collection(db, 'medications');
            const searchTokens = normalizedQuery.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(' ').filter(token => token);
            
            const prefixQuery = query(medicationsRef, where('searchable_name_normalized', '>=', normalizedQuery), where('searchable_name_normalized', '<=', normalizedQuery + '\uf8ff'), limit(10));
            const tokenQuery = query(medicationsRef, where('search_tokens_normalized', 'array-contains-any', searchTokens), limit(10));

            try {
                const [prefixSnapshot, tokenSnapshot] = await Promise.all([getDocs(prefixQuery), getDocs(tokenQuery)]);
                const resultsMap = new Map();
                
                // Coleta os dados completos do documento, não apenas o nome
                prefixSnapshot.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                tokenSnapshot.docs.forEach(doc => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));

                const combinedResults = Array.from(resultsMap.values());

                const rankedResults = combinedResults.map(result => {
                    let score = 0;
                    const resultTokens = new Set(result.search_tokens_normalized || []);
                    const resultNameNormalized = result.searchable_name_normalized || '';

                    if (resultNameNormalized.startsWith(normalizedQuery)) {
                        score += 100;
                    }

                    let matchingTokensCount = 0;
                    searchTokens.forEach(searchToken => {
                        if (resultTokens.has(searchToken)) {
                            matchingTokensCount++;
                        }
                    });
                    
                    score += matchingTokensCount * matchingTokensCount * 50;

                    if (matchingTokensCount > 0 && matchingTokensCount === searchTokens.length) {
                        score += 50;
                    }
                    
                    const extraTokens = resultTokens.size - matchingTokensCount;
                    score -= extraTokens * 5;
                    score -= result.name.length * 0.01;

                    return { ...result, score };
                });

                rankedResults.sort((a, b) => b.score - a.score);

                // Pega os nomes dos 10 melhores resultados
                const finalSuggestions = rankedResults.slice(0, 10).map(r => r.name);

                if (renderUI) {
                    renderAndPositionAutocomplete(inputElement, listElement, finalSuggestions, queryText, (selectedValue) => {
                        inputElement.value = selectedValue;
                        document.getElementById('confirm-med-name-btn').classList.remove('hidden');
                        hideActiveAutocomplete();
                        inputElement.focus();
                    });
                }
                
                // Retorna a lista de nomes já ordenada e limitada
                return finalSuggestions;

            } catch (error) {
                console.error("Erro na busca de medicações:", error);
                if (renderUI) showToast("Erro ao buscar medicações.", "error");
                return [];
            }
        }



        /**
         * Renderiza a lista de horários de uma medicação no formato "HHhMM (DD/MM)".
         * Agrupa horários do mesmo dia e formata a lista com "e" no final.
         * @param {object} medObject - O objeto da medicação (ex: { name: 'Dipirona', times: [...] }).
         * @param {HTMLElement} container - O elemento <div> onde o texto será exibido.
         */
        function renderMedicationTimes(medObject, container) {
            if (!medObject.times || medObject.times.length === 0) {
                container.innerHTML = '<p class="text-gray-500">Nenhum horário adicionado.</p>';
                return;
            }

            // 1. Agrupa os timestamps (que são números) por dia
            const groupedByDay = medObject.times.reduce((acc, timestamp) => {
                const date = new Date(timestamp);
                const dayKey = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                if (!acc[dayKey]) {
                    acc[dayKey] = [];
                }
                acc[dayKey].push(timestamp);
                return acc;
            }, {});

            // 2. Formata a exibição para cada dia
            const summaryParts = Object.keys(groupedByDay).sort().map(dayKey => {
                // Ordena os horários do dia
                const timesOnDay = groupedByDay[dayKey]
                    .sort()
                    .map(ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h'));
                
                // Junta os horários com vírgula e substitui a última vírgula por "e"
                let timesText;
                if (timesOnDay.length > 1) {
                    timesText = timesOnDay.slice(0, -1).join(', ') + ' e ' + timesOnDay.slice(-1);
                } else {
                    timesText = timesOnDay[0];
                }
                
                return `${timesText} (${dayKey})`;
            });

            // 3. Define o HTML final
            container.innerHTML = `<p class="font-semibold text-blue-700">Às ${summaryParts.join(' | ')}</p>`;
        }

        function renderRecentMedications(handovers) {
            recentMedsList.innerHTML = '';
            const meds24h = new Map();
            handovers.forEach(h => {
                if (h.medications && h.medications.length > 0) {
                    h.medications.forEach(med => {
                        if (!meds24h.has(med.name)) {
                            meds24h.set(med.name, h.timestamp.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
                        }
                    });
                }
            });
            if (meds24h.size === 0) {
                recentMedsList.innerHTML = '<p class="italic text-gray-500">Nenhuma medicação registrada nas últimas 24h.</p>';
            } else {
                const list = document.createElement('ul');
                list.className = 'list-disc pl-5 space-y-1';
                meds24h.forEach((time, name) => {
                    const item = document.createElement('li');
                    item.innerHTML = `${name} (às ${time})`;
                    list.appendChild(item);
                });
                recentMedsList.appendChild(list);
            }
        }

        const medActionArea = document.getElementById('medication-action-area');
        const actionAreaId = document.getElementById('action-area-id');
        const actionAreaType = document.getElementById('action-area-type');
        const actionAreaTitle = document.getElementById('action-area-title');
        const actionAreaSubtitle = document.getElementById('action-area-subtitle');
        const actionAreaDatetime = document.getElementById('action-area-datetime');
        const actionAreaCancelBtn = document.getElementById('action-area-cancel-btn');
        const actionAreaConfirmBtn = document.getElementById('action-area-confirm-btn');

        /**
         * Esconde todas as áreas de ação/edição e mostra a área de ação principal.
         */
        function resetMedicationModuleView() {
            medActionArea.classList.add('hidden');
            medEditorArea.classList.add('hidden');
            medMainActionArea.classList.remove('hidden');
            if (flatpickrInstance) {
                flatpickrInstance.destroy();
                flatpickrInstance = null;
            }
        }

        /**
         * Abre o editor inline para administrar uma dose agendada.
         * @param {string} doseId - O ID da dose a ser administrada.
         */
        function openAdministerDoseEditor(doseId) {
            const dose = dosesToRender.find(d => d.id === doseId);
            if (!dose) return;

            resetMedicationModuleView();
            medMainActionArea.classList.add('hidden');
            medActionArea.classList.remove('hidden');

            actionAreaId.value = doseId;
            actionAreaType.value = 'administer';
            actionAreaTitle.textContent = `Confirmar Administração`;
            actionAreaSubtitle.textContent = `${dose.name} ${formatDose(dose.dose)}`;
            actionAreaConfirmBtn.textContent = 'Sim, Administrar';
            const calendarConfig = {
                ...configAgendamento, // Começa com a configuração que você gosta
                minDate: null,       // Remove a restrição de data mínima
                maxDate: new Date()  // Adiciona a restrição de data máxima (não permite registrar no futuro)
            };
            flatpickrInstance = flatpickr("#action-area-datetime", calendarConfig);
            // A chamada .focus() foi removida para evitar que o calendário abra automaticamente.
        }

        /**
         * Abre o editor inline para adicionar uma nova dose a uma prescrição existente.
         * @param {string} prescriptionId - O ID da prescrição.
         */
        function openAddDoseEditor(prescriptionId) {
            const originalDose = administeredInShift.find(d => d.prescriptionId === prescriptionId);
            if (!originalDose) return;

            resetMedicationModuleView();
            medMainActionArea.classList.add('hidden');
            medActionArea.classList.remove('hidden');

            actionAreaId.value = prescriptionId;
            actionAreaType.value = 'add-dose';
            actionAreaTitle.textContent = `Registrar Nova Dose`;
            actionAreaSubtitle.textContent = `${originalDose.name} ${formatDose(originalDose.dose)}`;
            actionAreaConfirmBtn.textContent = 'Salvar Dose';
            const calendarConfig = {
                ...configAgendamento,
                minDate: null,
                maxDate: new Date()
            };
            flatpickrInstance = flatpickr("#action-area-datetime", calendarConfig);
        }

        // Listeners para os botões da nova área de ação
        actionAreaCancelBtn.addEventListener('click', resetMedicationModuleView);

        actionAreaConfirmBtn.addEventListener('click', () => {
            const type = actionAreaType.value;
            const id = actionAreaId.value;
            const timeValue = actionAreaDatetime.value;

            if (!timeValue) {
                showToast("É necessário selecionar um horário.", "error");
                return;
            }

            if (type === 'administer') {
                const doseIndex = dosesToRender.findIndex(d => d.id === id);
                if (doseIndex > -1) {
                    const administeredDose = { ...dosesToRender[doseIndex] };
                    administeredDose.time = flatpickr.parseDate(timeValue, "d/m/Y H:i");
                    
                    administeredInShift.push(administeredDose);

                    const originalPrescriptionIndex = activePrescriptions.findIndex(p => p.prescriptionId === administeredDose.prescriptionId);
                    if (originalPrescriptionIndex > -1) {
                        if (activePrescriptions[originalPrescriptionIndex].type === 'single') {
                            activePrescriptions.splice(originalPrescriptionIndex, 1);
                        }
                    }

                    renderMedicationLists();
                    setUnsavedChanges(true);
                    showToast(`${administeredDose.name} administrado com sucesso!`, 'success');
                }
            } else if (type === 'add-dose') {
                const originalDose = administeredInShift.find(d => d.prescriptionId === id);
                if (originalDose) {
                    const newDose = {
                        ...originalDose,
                        id: `med_${Date.now()}`,
                        time: flatpickr.parseDate(timeValue, "d/m/Y H:i"),
                    };
                    administeredInShift.push(newDose);
                    renderMedicationLists();
                    setUnsavedChanges(true);
                    showToast(`Nova dose de ${newDose.name} registrada.`, 'success');
                }
            }
            
            resetMedicationModuleView();
        });


        // --- NOVO BLOCO DE FUNÇÕES PARA CARREGAMENTO PAGINADO ---

        /**
         * Carrega o lote INICIAL de pacientes (agora usando getDocs para evitar duplicação).
         */
        async function loadInitialPatients() {
            // Reseta o estado da paginação
            lastVisiblePatientDoc = null;
            allPatientsLoaded = false;
            isLoadingPatients = false;
            currentPatientList = []; // Limpa a lista em memória
            patientList.innerHTML = ''; // Limpa o HTML da lista
            
            // Mostra o spinner enquanto carrega
            document.getElementById('load-more-trigger').classList.remove('hidden');

            try {
                const patientsRef = collection(db, 'patients');
                const q = query(
                    patientsRef,
                    where('status', '!=', 'arquivado'),
                    orderBy('lastUpdatedAt', 'desc'),
                    limit(PATIENTS_PER_PAGE)
                );

                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    renderPatientList([]); // Renderiza a mensagem de lista vazia
                    return;
                }
                
                lastVisiblePatientDoc = snapshot.docs[snapshot.docs.length - 1];
                const initialPatients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                currentPatientList = initialPatients;
                
                sortAndRenderPatientList();
                updatePatientCardMedicationStatus();
                
                if (initialPatients.length < PATIENTS_PER_PAGE) {
                    allPatientsLoaded = true;
                    document.getElementById('load-more-trigger').classList.add('hidden');
                } else {
                    setupInfiniteScrollObserver();
                }

            } catch (error) {
                console.error("Erro ao buscar pacientes iniciais:", error);
                showToast("Erro ao carregar pacientes.", "error");
            } finally {
                // Esconde o spinner se todos os pacientes já foram carregados
                if (allPatientsLoaded) {
                    document.getElementById('load-more-trigger').classList.add('hidden');
                }
            }
        }

        /**
         * Carrega o PRÓXIMO lote de pacientes quando o usuário rola a página.
         */
        async function loadMorePatients() {
            if (isLoadingPatients || allPatientsLoaded) {
                return; // Não faz nada se já estiver carregando ou se tudo já foi carregado
            }

            isLoadingPatients = true;
            document.getElementById('load-more-trigger').classList.remove('hidden');

            try {
                const patientsRef = collection(db, 'patients');
                const q = query(
                    patientsRef,
                    where('status', '!=', 'arquivado'),
                    orderBy('lastUpdatedAt', 'desc'),
                    startAfter(lastVisiblePatientDoc), // Começa a busca DEPOIS do último paciente visível
                    limit(PATIENTS_PER_PAGE)
                );

                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    allPatientsLoaded = true; // Não há mais pacientes
                    document.getElementById('load-more-trigger').classList.add('hidden');
                    return;
                }

                lastVisiblePatientDoc = snapshot.docs[snapshot.docs.length - 1];
                const newPatients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                currentPatientList.push(...newPatients); // Adiciona os novos pacientes à lista existente
                sortAndRenderPatientList();

                if (newPatients.length < PATIENTS_PER_PAGE) {
                    allPatientsLoaded = true;
                    document.getElementById('load-more-trigger').classList.add('hidden');
                }

            } catch (error) {
                console.error("Erro ao carregar mais pacientes:", error);
                showToast("Erro ao carregar mais pacientes.", "error");
            } finally {
                isLoadingPatients = false;
                if (allPatientsLoaded) {
                    document.getElementById('load-more-trigger').classList.add('hidden');
                }
            }
        }

        /**
         * Configura o IntersectionObserver para chamar loadMorePatients.
         */
        function setupInfiniteScrollObserver() {
            const trigger = document.getElementById('load-more-trigger');
            if(!trigger) return;

            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    loadMorePatients();
                }
            }, {
                root: null, // viewport
                rootMargin: '0px',
                threshold: 0.1
            });

            observer.observe(trigger);
        }

        /**
         * Compara o estado ATUAL do formulário com o estado ORIGINAL do paciente
         * e habilita/desabilita o botão de salvar de acordo.
         */
        function checkUnsavedChanges() {
            // Helper para comparar dois arrays de strings, ignorando a ordem.
            const areArraysEqualUnordered = (arr1 = [], arr2 = []) => {
                if (arr1.length !== arr2.length) return false;
                const set1 = new Set(arr1);
                return arr2.every(item => set1.has(item));
            };

            // 1. Verifica campos de texto simples
            if (document.getElementById('form-evolution').value.trim() !== (originalPatientState.evolution || '')) {
                setUnsavedChanges(true);
                return;
            }
            if (document.getElementById('form-pending-obs').value.trim() !== (originalPatientState.pendingObs || '')) {
                setUnsavedChanges(true);
                return;
            }
            
            // 2. Verifica se novas medicações foram adicionadas (sempre é uma alteração)
            if (currentMedications.length > 0) {
                setUnsavedChanges(true);
                return;
            }

            // 3. Verifica se exames foram concluídos, reagendados ou cancelados
            if (currentShiftCompletedExams.length > 0 || currentShiftRescheduledExams.length > 0) {
                setUnsavedChanges(true);
                return;
            }
            
            // 4. Verifica listas de tags (Diagnósticos, Comorbidades, Precauções, etc.)
            const currentDiagnoses = getItemsFromContainer('diagnoses-tags-container');
            if (!areArraysEqualUnordered(currentDiagnoses, originalPatientState.diagnoses)) {
                setUnsavedChanges(true);
                return;
            }

            const currentComorbidities = getItemsFromContainer('comorbidities-tags-container');
            if (!areArraysEqualUnordered(currentComorbidities, originalPatientState.comorbidities)) {
                setUnsavedChanges(true);
                return;
            }

            const currentPrecautions = getItemsFromContainer('precaucoes-container');
            if (!areArraysEqualUnordered(currentPrecautions, originalPatientState.precautions)) {
                setUnsavedChanges(true);
                return;
            }
            
            // 5. Verifica as alergias (leva em conta o radio button)
            const allergyRadioYes = document.getElementById('allergy-radio-yes');
            const currentAllergies = allergyRadioYes.checked ? getItemsFromContainer('allergies-tags-container') : [];
            if (!areArraysEqualUnordered(currentAllergies, originalPatientState.allergies)) {
                setUnsavedChanges(true);
                return;
            }
            
            // 6. Verifica os dispositivos
            const currentDevices = Array.from(document.querySelectorAll('#dispositivos-grid input[type="checkbox"]:checked')).map(chk => chk.value);
            if (!areArraysEqualUnordered(currentDevices, originalPatientState.devices)) {
                setUnsavedChanges(true);
                return;
            }

            // Se chegou até aqui, não há alterações não salvas.
            setUnsavedChanges(false);
        }

        /**
         * Pega a lista global de pacientes, ordena por criticidade e chama a renderização.
         */
        function sortAndRenderPatientList() {
            if (!currentPatientList || currentPatientList.length === 0) {
                renderPatientList([]); // Garante que a mensagem de "nenhum paciente" apareça
                return;
            }

            const fugulinSeverityMap = {
                'Cuidados Intensivos': 5,
                'Cuidados Semi-Intensivos': 4,
                'Cuidados de Alta Dependência': 3,
                'Cuidados Intermediários': 2,
                'Cuidados Mínimos': 1
            };

            currentPatientList.sort((a, b) => {
                // Critério 1: NEWS2 Score (maior primeiro)
                const scoreA = a.lastNews2Score ?? -1;
                const scoreB = b.lastNews2Score ?? -1;
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }

                // Critério 2: Fugulin (mais grave primeiro)
                const severityA = fugulinSeverityMap[a.lastFugulinClassification] || 0;
                const severityB = fugulinSeverityMap[b.lastFugulinClassification] || 0;
                if (severityB !== severityA) {
                    return severityB - severityA;
                }

                // Critério 3: Data da Última Atualização (mais recente primeiro)
                const timeA = a.lastUpdatedAt ? a.lastUpdatedAt.toMillis() : 0;
                const timeB = b.lastUpdatedAt ? b.lastUpdatedAt.toMillis() : 0;
                return timeB - timeA;
            });

            // Chama a função que redesenha a lista inteira com a nova ordem
            renderPatientList(currentPatientList);
        }

        /**
         * Verifica as medicações de todos os pacientes e atualiza a UI do painel.
         */
        async function updatePatientCardMedicationStatus() {
            const allMeds = await getUpcomingAndOverdueMedications();
            const now = new Date();
            const overduePatientIds = new Set();
            
            allMeds.forEach(med => {
                if (med.time < now) {
                    overduePatientIds.add(med.patientId);
                }
            });

            // Remove a lógica que alterava o ícone principal
            // medicationAlertIndicator e has-overdue não são mais necessários aqui.

            // Atualiza cada card de paciente
            document.querySelectorAll('.patient-card, .patient-list-item').forEach(card => {
                const patientId = card.dataset.id;
                if (overduePatientIds.has(patientId)) {
                    card.classList.add('overdue-medication');
                } else {
                    card.classList.remove('overdue-medication');
                }
            });
        }

        /**
         * Renderiza a lista COMPLETA de pacientes no DOM, limpando o conteúdo anterior.
         * Esta função é responsável apenas por criar o HTML e os listeners.
         * @param {Array} patients - A lista de pacientes JÁ ORDENADA a ser renderizada.
         */
        function renderPatientList(patients) {
            patientList.innerHTML = ''; // Limpa a lista para evitar duplicatas

            // 1. Extrai todos os números de leito da lista de pacientes atual.
            const availableBeds = [...new Set(patients.map(p => p.roomNumber).filter(Boolean))].sort((a, b) => a - b);
            
            // 2. Chama a função para popular o dropdown do filtro com os leitos encontrados.
            populateBedFilter(availableBeds);

            // Define as classes do container com base no modo de visualização
            if (currentViewMode === 'grid') {
                patientList.className = 'mt-6 px-4 sm:px-0 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3';
            } else {
                patientList.className = 'mt-6 px-4 sm:px-0 flex flex-col gap-3';
            }
            
            // Lógica da mensagem de "nenhum paciente"
            const hasPatients = patients.length > 0;
            if (noPatientsMessage && patientList) {
                noPatientsMessage.style.display = hasPatients ? 'none' : 'block';
                patientList.style.display = hasPatients ? (currentViewMode === 'list' ? 'flex' : 'grid') : 'none';
            }
            if (!hasPatients) return;

            // A partir daqui, é o seu código original de criação de cards que já estava funcionando
            patients.forEach(patient => {
                const patientName = patient.name || 'Nome Indefinido';
                const patientNumber = patient.patientNumber || 'N/A';
                const roomNumber = patient.roomNumber || 'N/A';
                const age = calculateAge(patient.dob);
                let admissionDate = 'N/A';
                if (patient.createdAt && patient.createdAt.toDate) {
                    admissionDate = patient.createdAt.toDate().toLocaleDateString('pt-BR');
                }

                let news2BadgeHTML = '';
                if (patient.lastNews2Level) {
                    const news2Classes = { 'Risco Baixo': 'news2-low', 'Risco Baixo-Médio': 'news2-low-medium', 'Risco Médio': 'news2-medium', 'Risco Alto': 'news2-high' };
                    const badgeClass = news2Classes[patient.lastNews2Level] || 'bg-gray-100 text-gray-800';
                    news2BadgeHTML = `<span class="status-badge text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeClass}">NEWS ${patient.lastNews2Score}</span>`;
                }

                let fugulinBadgeHTML = '';
                if (patient.lastFugulinClassification) {
                    const fugulinClasses = { 'Cuidados Mínimos': 'fugulin-minimos', 'Cuidados Intermediários': 'fugulin-intermediarios', 'Cuidados de Alta Dependência': 'fugulin-alta-dependencia', 'Cuidados Semi-Intensivos': 'fugulin-semi-intensivos', 'Cuidados Intensivos': 'fugulin-intensivos' };
                    const badgeClass = fugulinClasses[patient.lastFugulinClassification] || 'bg-gray-100 text-gray-800';
                    const textoAbreviado = patient.lastFugulinClassification.replace('Cuidados de ', '').replace('Cuidados ', '');
                    fugulinBadgeHTML = `<span class="status-badge text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeClass}">${textoAbreviado}</span>`;
                }

                let patientElementHTML = '';
                if (currentViewMode === 'grid') {
                    patientElementHTML = `
                        <div class="patient-card bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col">
                            <div class="p-4 flex-grow relative">
                                <div class="absolute top-2 right-2">
                                    <button class="options-button p-2 rounded-full hover:bg-gray-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 text-gray-500"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                                    </button>
                                    <div class="dropdown-menu hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-40">
                                        <a href="#" class="edit-patient-button block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Editar Dados Cadastrais</a>
                                        <a href="#" class="delete-patient-button-from-card block px-4 py-2 text-sm text-red-600 hover:bg-gray-100">Arquivar Paciente</a>
                                    </div>
                                </div>
                                <div class="patient-info-wrapper cursor-pointer">
                                    <p class="text-2xl font-bold text-blue-700">${roomNumber}</p>
                                    <h3 class="text-lg font-bold text-gray-800 truncate pr-8 mt-1">${patientName}</h3>
                                    <p class="text-sm text-gray-600 mt-2"><strong>${age} anos</strong></p>
                                    <p class="text-xs text-gray-500">Prontuário: ${patientNumber}</p>
                                </div>
                            </div>
                            <div class="bg-gray-50 border-t px-4 py-3">
                                <div class="flex flex-wrap gap-2 items-center justify-between min-h-[28px]">
                                    <div class="flex flex-wrap gap-2 items-center">
                                        ${news2BadgeHTML || ''}
                                        ${fugulinBadgeHTML || ''}
                                    </div>
                                    <p class="text-xs font-semibold text-gray-500 whitespace-nowrap">INT: ${admissionDate}</p>
                                </div>
                            </div>
                        </div>`;
                } else {
                    patientElementHTML = `
                        <div class="patient-list-item bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 flex items-center p-2 sm:p-3">
                            <div class="patient-info-wrapper cursor-pointer flex-grow flex items-center gap-x-2 sm:gap-x-4 min-w-0">
                                <div class="text-center w-14 sm:w-16 flex-shrink-0">
                                    <p class="text-xs text-gray-500">Leito</p>
                                    <p class="text-2xl font-bold text-blue-600">${roomNumber}</p>
                                </div>
                                <div class="flex-1 min-w-0 border-l pl-2 sm:pl-4">
                                    <p class="text-base font-semibold text-gray-900 truncate">${patientName}</p>
                                    <p class="text-sm text-gray-600 mt-1 flex flex-wrap items-center">
                                        <strong class="mr-1">${age} anos</strong>
                                        <span class="hidden sm:inline text-gray-300 mx-1">|</span>
                                        <span class="text-xs w-full sm:w-auto">Pront.: ${patientNumber}</span>
                                    </p>
                                </div>
                            </div>
                            <div class="flex flex-col sm:flex-row items-center gap-x-2 sm:gap-x-3 ml-2 sm:ml-4 flex-shrink-0">
                                ${news2BadgeHTML || ''}
                                ${fugulinBadgeHTML || ''}
                            </div>
                            <div class="relative ml-2 sm:ml-4 flex-shrink-0">
                                <button class="options-button p-2 rounded-full hover:bg-gray-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 text-gray-500"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                                </button>
                                <div class="dropdown-menu hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-40">
                                    <a href="#" class="edit-patient-button block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Editar Dados cadastrais</a>
                                    <a href="#" class="delete-patient-button-from-card block px-4 py-2 text-sm text-red-600 hover:bg-gray-100">Arquivar Paciente</a>
                                </div>
                            </div>
                        </div>`;
                }
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = patientElementHTML.trim();
                const itemContainer = tempDiv.firstChild;

                if (itemContainer) {
                    itemContainer.dataset.id = patient.id;
                    itemContainer.dataset.name = patientName.toLowerCase();
                    itemContainer.dataset.number = patientNumber;
                    itemContainer.dataset.room = roomNumber;
                    itemContainer.dataset.dob = patient.dob;
                    itemContainer.dataset.news2Score = patient.lastNews2Score || '';
                    itemContainer.dataset.fugulinClass = patient.lastFugulinClassification || '';

                    const optionsButton = itemContainer.querySelector('.options-button');
                    const dropdownMenu = itemContainer.querySelector('.dropdown-menu');
                    const editButton = itemContainer.querySelector('.edit-patient-button');
                    const deleteButton = itemContainer.querySelector('.delete-patient-button-from-card');
                    const patientInfoWrapper = itemContainer.querySelector('.patient-info-wrapper');

                    if (optionsButton && dropdownMenu) {
                        optionsButton.addEventListener('click', (e) => {
                            e.stopPropagation();
                            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                                if (menu !== dropdownMenu) menu.classList.add('hidden');
                            });
                            dropdownMenu.classList.toggle('hidden');
                        });
                    }
                    if (editButton) {
                        editButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openEditModal(patient);
                            if (dropdownMenu) dropdownMenu.classList.add('hidden');
                        });
                    }
                    if (deleteButton) {
                        deleteButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            currentPatientId = patient.id;
                            deleteConfirmModal.classList.remove('hidden');
                            if (dropdownMenu) dropdownMenu.classList.add('hidden');
                        });
                    }
                    if (patientInfoWrapper) {
                        patientInfoWrapper.addEventListener('click', () => showPatientDetail(patient.id));
                    }
                    patientList.appendChild(itemContainer);
                }
            });
        }

        function openEditModal(patient) {
            document.getElementById('edit-patient-id').value = patient.id;
            document.getElementById('edit-patient-name').value = patient.name || '';
            document.getElementById('edit-patient-dob').value = patient.dob || '';
            document.getElementById('edit-patient-number').value = patient.patientNumber || '';
            document.getElementById('edit-patient-room').value = patient.roomNumber || '';
            document.getElementById('edit-patient-justification').value = '';
            
            // Garante que o modal está visível
            editPatientModal.classList.remove('hidden');
            // Aplica as máscaras nos campos do modal de edição
            applyInputMasksAndValidation();
        }

        function filterPatients() {
            const searchTerm = searchPatientInput.value.toLowerCase();
            const selectedBeds = Array.from(bedFilterList.querySelectorAll('input:checked')).map(cb => cb.value);
            
            const cards = document.querySelectorAll('.patient-card, .patient-list-item');
            let found = false;
            
            // CORREÇÃO PRINCIPAL: Determina qual estilo de display usar
            // Se estiver em modo lista, usamos 'flex', senão, o padrão 'block' para a grade.
            const displayStyle = currentViewMode === 'list' ? 'flex' : 'block';

            cards.forEach(card => {
                const nameMatch = (card.dataset.name || '').includes(searchTerm) || (card.dataset.number || '').includes(searchTerm);
                const bedMatch = selectedBeds.length === 0 || selectedBeds.includes(card.dataset.room);
                
                if (nameMatch && bedMatch) {
                    // Aplica o estilo de display correto
                    card.style.display = displayStyle; 
                    found = true;
                } else {
                    card.style.display = 'none';

                }
            });
            
            // A lógica para a mensagem "nenhum paciente" já estava correta
            const noPatientsMessage = document.getElementById('no-patients-message');
            if (noPatientsMessage) {
            noPatientsMessage.style.display = found ? 'none' : 'block';
            }
        }

        /**
         * Preenche o modal de "Última Passagem" e sua seção de adendos.
         * VERSÃO FINAL: Reseta COMPLETAMENTE o estado da UI de adendos a cada abertura.
         */
        function populateLastHandoverModal() {
            if (!currentHandovers || currentHandovers.length === 0) {
                showToast("Nenhum plantão anterior encontrado para este paciente.", "warning");
                return;
            }

            const latestHandover = currentHandovers[0];
            currentlyViewedHandover = latestHandover;
            const lastHandoverTitle = document.getElementById('last-handover-title');

            const lastHandoverSubtitle = document.getElementById('last-handover-subtitle');
            const lastHandoverContent = document.getElementById('last-handover-content');
            const adendosSection = document.getElementById('last-handover-adendos-section');

            // Garante que, ao abrir o modal, a UI de adendos esteja no estado inicial.
            const formWrapper = adendosSection.querySelector('.inline-adendo-form-wrapper');
            const triggerWrapper = adendosSection.querySelector('.add-adendo-trigger-wrapper');
            const toggleBtn = adendosSection.querySelector('.toggle-adendos-view-btn');

            formWrapper.classList.add('hidden');        // 1. Esconde o formulário
            triggerWrapper.classList.remove('hidden'); // 2. Garante que o botão de adicionar esteja visível
            formWrapper.querySelector('textarea').value = ''; // 3. Limpa o texto
            toggleBtn.dataset.state = 'last';             // 4. Reseta o estado da setinha para "recolhido"

            const date = latestHandover.timestamp?.toDate ? latestHandover.timestamp.toDate() : new Date();

            // Preenche o nome do paciente
            if (lastHandoverTitle && currentPatientData) {
                lastHandoverTitle.innerHTML = `Última Passagem de Plantão: <span class="font-bold text-gray-800">${currentPatientData.name || 'Paciente'}</span>`;
            }

            // Preenche o subtítulo com os dados do plantão
            if (lastHandoverSubtitle) {
                lastHandoverSubtitle.innerHTML = `Registrado por <strong>${latestHandover.professionalName || 'N/A'}</strong> em ${date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`;
            }
            
            if (lastHandoverContent) {
                lastHandoverContent.innerHTML = generateDetailedHandoverHtml(latestHandover);
            }
            
            renderAdendosList(latestHandover.adendos, adendosSection);
            
            lastHandoverModal.classList.remove('hidden');
        }
        
        /**
         * Preenche o módulo de monitoramento (áreas de visualização E inputs escondidos)
         * com os dados de um handover específico.
         * @param {object | null} monitoringData - O objeto de monitoramento do último handover.
         */
        function populateMonitoringModule(monitoringData) {
            const data = monitoringData || {};
            const module = document.getElementById('module-monitoramento');
            if (!module) return;

            const fillItem = (id, value) => {
                const input = document.getElementById(id);
                const displayArea = input?.closest('.clickable-item-area')?.querySelector('.monitoring-display-area');
                if (input) input.value = value || '';
                if (displayArea) displayArea.textContent = value || '';
            };

            fillItem('form-sv-pa', data.pa);
            fillItem('form-sv-fc', data.fc);
            fillItem('form-sv-fr', data.fr);
            fillItem('form-sv-sato2', data.sato2);
            fillItem('form-sv-temp', data.temp);
            fillItem('form-sv-hgt', data.hgt);
            fillItem('form-sv-others', data.others);

            // Esta parte agora vai funcionar, pois `data.o2Supplement` e `data.consciencia` existirão
            const o2Checkbox = document.getElementById('form-sv-o2');
            if (o2Checkbox) o2Checkbox.checked = data.o2Supplement || false;

            const conscienciaContainer = document.getElementById('monitoring-consciencia-container');
            if (conscienciaContainer) {
                conscienciaContainer.innerHTML = '';
                const conscienciaText = (data.consciencia && data.consciencia.length > 0) ? data.consciencia[0] : null;
                if (conscienciaText) {
                    const option = monitoringOptions.consciencia.find(opt => opt.text === conscienciaText);
                    if (option) {
                        const tag = createListItem(option.text);
                        tag.dataset.score = option.value;
                        conscienciaContainer.appendChild(tag);
                    }
                }
            }
        }

        /**
         * Trunca um nome longo, mantendo as primeiras palavras até um limite de caracteres,
         * para exibição em telas pequenas.
         * @param {string} fullName - O nome completo do paciente.
         * @param {number} maxLength - O número máximo de caracteres permitidos (padrão: 25).
         * @returns {string} - O nome truncado ou o nome original se for curto o suficiente.
         */
        function truncateNameByWords(fullName, maxLength = 25) {
            // Se a tela for maior que a de um celular ou o nome já for curto, retorna o nome completo.
            if (window.innerWidth > 768 || fullName.length <= maxLength) {
                return fullName;
            }

            const words = fullName.split(' ');
            let truncatedName = '';

            // Constrói o nome palavra por palavra até atingir o limite de caracteres
            for (const word of words) {
                if ((truncatedName + word).length + 1 > maxLength) {
                    break; // Para se a próxima palavra exceder o limite
                }
                truncatedName += word + ' ';
            }

            // Caso a primeira palavra sozinha já seja maior que o limite
            if (truncatedName.trim() === '') {
                return words[0].substring(0, maxLength - 3) + '...';
            }

            // Adiciona "..." se o nome foi de fato truncado
            return truncatedName.trim() + (truncatedName.trim() !== fullName.trim() ? '...' : '');
        }

        // Esta função cria o registro no histórico e chama a função de renderização.
        async function showPatientDetail(patientId, preloadedData = null, fromHistory = false) {
            // Limpa o timer de atualização de medicação anterior, se existir
            if (medicationUITimer) clearInterval(medicationUITimer);
            // Se não estivermos vindo do histórico (ou seja, foi um clique do usuário),
            // criamos uma nova entrada no histórico.
            if (!fromHistory) {
                history.pushState({ screen: 'patientDetail', patientId: patientId }, `Paciente ${patientId}`, `#paciente/${patientId}`);
            }
            // A função de renderização é chamada em ambos os casos.
            renderPatientDetail(patientId, preloadedData);
        }

        // Esta função contém a lógica para buscar os dados e renderizar a tela de detalhes do paciente.
        // Ela NÃO mexe com o histórico do navegador, evitando loops.
        async function renderPatientDetail(patientId, preloadedData = null) {
            // O corpo inteiro da sua função showPatientDetail antiga vem aqui, exceto a linha history.pushState.
            showActionLoader();
            currentPatientId = patientId;
            currentHistoryPage = 1;
            
            resetFormState();

            try {
                let patientData;

                if (preloadedData) {
                    patientData = preloadedData;
                } else {
                    const patientRef = doc(db, 'patients', patientId);
                    const patientSnap = await getDoc(patientRef);
                    if (patientSnap.exists()) {
                        patientData = patientSnap.data();
                    } else {
                        showToast("Paciente não encontrado.", "error");
                        showScreen('main');
                        return;
                    }
                }
                
                currentPatientData = { id: patientId, ...patientData };

                // Primeiro, carrega os handovers para encontrar os últimos dados.
                const handoversRef = collection(db, 'patients', patientId, 'handovers');
                const q = query(handoversRef, orderBy('timestamp', 'desc'));
                const handoversSnapshot = await getDocs(q);
                const handoversHistory = handoversSnapshot.docs.map(doc => doc.data());
                const lastHandoverWithMonitoring = handoversHistory.find(h => h.monitoring && Object.values(h.monitoring).some(v => v));

                resetFormState();
                populateMonitoringModule(lastHandoverWithMonitoring ? lastHandoverWithMonitoring.monitoring : null);

                // 1. Limpa e carrega as prescrições PRIMEIRO
                activePrescriptions = [];
                administeredInShift = [];
                if (patientData.activeMedicationPrescriptions) {
                    activePrescriptions = patientData.activeMedicationPrescriptions.map(med => {
                        const newMed = { ...med };
                        if (med.time?.toDate) newMed.time = med.time.toDate();
                        if (med.startTime?.toDate) newMed.startTime = med.startTime.toDate();
                        return newMed;
                    });
                }
                
                // 2. AGORA, captura o estado original com os dados já carregados
                originalPatientState = {
                    diagnoses: patientData.activeDiagnoses || [],
                    comorbidities: patientData.activeComorbidities || [],
                    allergies: patientData.activeAllergies || [],
                    precautions: patientData.activePrecautions || [],
                    risks: patientData.activeRisks || { lpp: [], quedas: [], bronco: [], iras: [] },
                    nursingCare: patientData.activeNursingCare || { cuidadoCorporal: [], motilidade: [], deambulacao: [], alimentacao: [], eliminacao: [] },
                    devices: patientData.activeDevices || [],
                    scheduledExams: patientData.activeScheduledExams || [],
                    pendingExams: patientData.activePendingExams || [],
                    activeMedicationPrescriptions: JSON.parse(JSON.stringify(activePrescriptions)), // Copia profunda do estado CORRETO
                    evolution: patientData.lastEvolution || '',
                    pendingObs: patientData.lastPendingObs || '',
                    monitoring: lastHandoverWithMonitoring ? lastHandoverWithMonitoring.monitoring : {}
                };
                
                // 3. RENDERIZA a lista de medicações na tela
                renderMedicationLists();

                // Preenche os detalhes do cabeçalho
                patientDetailName.textContent = truncateNameByWords(patientData.name);
                patientDetailNumber.textContent = patientData.patientNumber;
                patientDetailRoom.textContent = patientData.roomNumber;
                patientDetailAge.textContent = `${calculateAge(patientData.dob)} anos`;
                const admissionDate = patientData.createdAt?.toDate ? patientData.createdAt.toDate().toLocaleDateString('pt-BR') : 'N/A';
                document.getElementById('patient-detail-admission-date').textContent = admissionDate;

                const patientDetailNews2 = document.getElementById('patient-detail-news2');
                const patientDetailFugulin = document.getElementById('patient-detail-fugulin');

                // Tag NEWS2
                if (patientData.lastNews2Score !== undefined && patientData.lastNews2Level) {
                    const news2Score = patientData.lastNews2Score;
                    const news2Level = patientData.lastNews2Level;
                    const news2Classes = {
                        'Risco Baixo': 'news2-low',
                        'Risco Baixo-Médio': 'news2-low-medium',
                        'Risco Médio': 'news2-medium',
                        'Risco Alto': 'news2-high'
                    };
                    const badgeClass = news2Classes[news2Level] || 'bg-gray-100 text-gray-800';
                    patientDetailNews2.innerHTML = `<span class="text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeClass}">NEWS: ${news2Score} - ${news2Level}</span>`;
                } else {
                    patientDetailNews2.textContent = 'Ainda não calculado.';
                }

                // Tag Fugulin
                if (patientData.lastFugulinClassification) {
                    const fugulinClasses = {
                        'Cuidados Mínimos': 'fugulin-minimos',
                        'Cuidados Intermediários': 'fugulin-intermediarios',
                        'Cuidados de Alta Dependência': 'fugulin-alta-dependencia',
                        'Cuidados Semi-Intensivos': 'fugulin-semi-intensivos',
                        'Cuidados Intensivos': 'fugulin-intensivos'
                    };
                    const badgeClass = fugulinClasses[patientData.lastFugulinClassification] || 'bg-gray-100 text-gray-800';
                    patientDetailFugulin.innerHTML = `<span class="status-badge text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeClass}">Fugulin: ${patientData.lastFugulinScore} - ${patientData.lastFugulinClassification}</span>`;
                } else {
                    patientDetailFugulin.innerHTML = '';
                }

                renderItemsAsList('diagnoses-tags-container', patientData.activeDiagnoses || []);
                renderItemsAsList('comorbidities-tags-container', patientData.activeComorbidities || []);
                renderItemsAsList('allergies-tags-container', patientData.activeAllergies || []);
                renderItemsAsList('precaucoes-container', patientData.activePrecautions || []);
                
                if (patientData.activeRisks) {
                    renderItemsAsList('riscos-lpp-container', patientData.activeRisks.lpp || []);
                    renderItemsAsList('riscos-quedas-container', patientData.activeRisks.quedas || []);
                    renderItemsAsList('riscos-bronco-container', patientData.activeRisks.bronco || []);
                    renderItemsAsList('riscos-iras-container', patientData.activeRisks.iras || []);
                }
                
                if (patientData.activeNursingCare) {
                    const care = patientData.activeNursingCare;
                    const renderFugulinItem = (key, items) => {
                        const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                        const container = document.getElementById(`fugulin-${kebabKey}-container`);
                        if(container && items && items.length > 0) {
                            container.innerHTML = '';
                            items.forEach(itemText => {
                                const option = fugulinOptions[key].find(opt => opt.text === itemText);
                                if (option) {
                                    const tag = createListItem(option.text);
                                    tag.dataset.score = option.value;
                                    container.appendChild(tag);
                                }
                            });
                        }
                    };
                    renderFugulinItem('cuidadoCorporal', care.cuidadoCorporal || []);
                    renderFugulinItem('motilidade', care.motilidade || []);
                    renderFugulinItem('deambulacao', care.deambulacao || []);
                    renderFugulinItem('alimentacao', care.alimentacao || []);
                    renderFugulinItem('eliminacao', care.eliminacao || []);
                }

                currentShiftCompletedExams = []; 
                patientExams = [
                    ...(patientData.activeScheduledExams || []),
                    ...(patientData.activePendingExams || [])
                ];
                renderExams();
                
                setupDispositivosModule();
                const activeDevices = patientData.activeDevices || [];
                originalPatientDevices = [...activeDevices];
                document.querySelectorAll('#dispositivos-grid input[type="checkbox"]').forEach(chk => chk.checked = false);
                customDispositivosContainer.innerHTML = '';
                activeDevices.forEach(deviceName => {
                    const staticCheckbox = dispositivosGrid.querySelector(`input[value="${deviceName}"]`);
                    if (staticCheckbox) { staticCheckbox.checked = true; } 
                    else { addCustomDispositivo(deviceName, true); }
                });
                
                if ((patientData.activeAllergies || []).length > 0) {
                    document.getElementById('allergy-radio-yes').checked = true;
                    document.getElementById('allergy-input-container').classList.remove('hidden');
                } else if (patientData.hasOwnProperty('activeAllergies')) { 
                    document.getElementById('allergy-radio-no').checked = true;
                    document.getElementById('allergy-input-container').classList.add('hidden');
                }
                updateAllergyTitleVisibility();
                if (!patientDetailListenersAttached) {
                    setupAllergyToggle(
                        document.getElementById('allergy-radio-yes'),
                        document.getElementById('allergy-radio-no'),
                        document.getElementById('allergy-input-container'),
                        document.getElementById('allergies-tags-container')
                    );
                    
                    const addHandoversForm = document.getElementById('add-handovers-form');
                    if (addHandoversForm) {
                        addHandoversForm.addEventListener('input', () => {
                            setUnsavedChanges(true);
                        });

                        addHandoversForm.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                const targetInput = e.target;
                                const inputValue = targetInput.value.trim();
                                // Lógica para alergias
                                if (targetInput.id === 'form-allergies') {
                                    e.preventDefault();
                                    const moduleCard = targetInput.closest('#module-diagnostico');
                                    if (inputValue) {
                                        const container = document.getElementById('allergies-tags-container');
                                        container.appendChild(createListItem(inputValue));
                                        targetInput.value = '';
                                        setUnsavedChanges(true);
                                        updateDiagnosisSummary();
                                        updateAllergyTitleVisibility();
                                    } else {
                                        targetInput.parentElement.classList.add('hidden');
                                        if (moduleCard) {
                                            exitEditMode(moduleCard);
                                        }
                                        updateAllergyTitleVisibility();
                                    }
                                    return;
                                }

                                const enterToAddTagMap = {
                                    'form-comorbidities': { containerId: 'comorbidities-tags-container' },
                                    'form-precaucoes': { containerId: 'precaucoes-container' },
                                };

                                const config = enterToAddTagMap[targetInput.id];

                                if (config) {
                                    e.preventDefault();
                                    if (inputValue) {
                                        const moduleCard = targetInput.closest('.bg-white.rounded-lg.shadow');
                                        if (config.isDevice) {
                                            addCustomDispositivo(inputValue, true);
                                        } else {
                                            const container = document.getElementById(config.containerId);
                                            container.appendChild(createListItem(inputValue));
                                        }
                                        setUnsavedChanges(true);
                                        if (config.containerId === 'comorbidities-tags-container' || config.containerId === 'diagnoses-tags-container') {
                                            updateDiagnosisSummary();
                                        }
                                        if (moduleCard) {
                                            const triggerWrapper = moduleCard.querySelector('.trigger-wrapper');
                                            const cancelWrapper = moduleCard.querySelector('.cancel-action-wrapper');
                                            const inputWrapper = moduleCard.querySelector('.input-wrapper');
                                            triggerWrapper?.classList.remove('hidden');
                                            cancelWrapper?.classList.add('hidden');
                                            inputWrapper?.classList.add('hidden');
                                            if(targetInput) targetInput.value = '';
                                            exitEditMode(moduleCard);
                                        }
                                    }
                                } else if (targetInput.tagName !== 'TEXTAREA') {
                                    e.preventDefault();
                                }
                            }
                        });
                        addHandoversForm.addEventListener('submit', async (e) => {
                            e.preventDefault();
                            if (checkForInvalidInputs()) {
                                showToast("Corrija os valores inválidos no monitoramento antes de salvar.", 3500);
                                return;
                            }

                            const submitButton = e.target.querySelector('button[type="submit"]');
                            submitButton.disabled = true;
                            submitButton.innerHTML = `<div class="flex items-center justify-center">...Salvando...</div>`;

                            try {
                                const openModule = document.querySelector('.module-editing');
                                if (openModule && openModule.id !== 'module-medicacoes' && openModule.id !== 'module-exames') {
                                    exitEditMode(openModule);
                                }

                                const batch = writeBatch(db);
                                const patientRef = doc(db, 'patients', currentPatientId);
                                const newHandoverRef = doc(collection(patientRef, 'handovers'));
                                const prescriptionsToSave = activePrescriptions.map(p => {
                                    const cleanPrescription = { ...p };
                                    if (p.time) cleanPrescription.time = Timestamp.fromDate(new Date(p.time));
                                    if (p.startTime) cleanPrescription.startTime = Timestamp.fromDate(new Date(p.startTime));
                                    return cleanPrescription;
                                });
                                const administeredToSaveForHistory = administeredInShift.map(p => ({ ...p }));

                                const calculateMedicationChanges = (originalMeds = [], currentMeds = [], administeredMeds = []) => {
                                    const originalMap = new Map(originalMeds.map(p => [p.prescriptionId, p]));
                                    const currentMap = new Map(currentMeds.map(p => [p.prescriptionId, p]));

                                    const changes = { administered: [], added: [], suspended: [], modified: [] };

                                    administeredMeds.forEach(med => {
                                        changes.administered.push({ name: med.name, dose: med.dose, time: med.time });
                                    });

                                    currentMap.forEach((med, id) => {
                                        const originalMed = originalMap.get(id);
                                        if (!originalMed) {
                                            changes.added.push(med);
                                        } else {
                                            const originalSimple = { name: originalMed.name, dose: originalMed.dose, frequency: originalMed.frequency, duration: originalMed.duration };
                                            const currentSimple = { name: med.name, dose: med.dose, frequency: med.frequency, duration: med.duration };
                                            if (JSON.stringify(originalSimple) !== JSON.stringify(currentSimple)) {
                                                changes.modified.push({ before: originalMed, after: med }); 
                                            }
                                        }
                                    });

                                    originalMap.forEach((med, id) => {
                                        if (!currentMap.has(id)) {
                                            changes.suspended.push(med);
                                        }
                                    });

                                    return changes;
                                };

                                const medicationChanges = calculateMedicationChanges(
                                    originalPatientState.activeMedicationPrescriptions,
                                    activePrescriptions,
                                    administeredInShift
                                );

                                const finalVitalsForSave = getFinalVitalsData();
                                const news2Result = calculateNEWS2(finalVitalsForSave);
                                const devicesToSave = Array.from(document.querySelectorAll('#dispositivos-grid input[type="checkbox"]:checked')).map(chk => chk.value);
                                const fugulinResult = calculateFugulin({
                                    news2: news2Result,
                                    dispositivos: devicesToSave,
                                    medicationsAdministered: administeredInShift,
                                    consciencia: finalVitalsForSave.consciencia,
                                    cuidadoCorporal: getFugulinScoreFromDOMorState('cuidadoCorporal'),
                                    motilidade: getFugulinScoreFromDOMorState('motilidade'),
                                    deambulacao: getFugulinScoreFromDOMorState('deambulacao'),
                                    alimentacao: getFugulinScoreFromDOMorState('alimentacao'),
                                    eliminacao: getFugulinScoreFromDOMorState('eliminacao')
                                });

                                const allergyRadioNo = document.getElementById('allergy-radio-no');
                                let currentAllergies = allergyRadioNo && allergyRadioNo.checked ? [] : getItemsFromContainer('allergies-tags-container');
                                const currentDiagnoses = getItemsFromContainer('diagnoses-tags-container');
                                const currentComorbidities = getItemsFromContainer('comorbidities-tags-container');
                                const currentPrecautions = getItemsFromContainer('precaucoes-container');
                                const currentRisks = { lpp: getItemsFromContainer('riscos-lpp-container'), quedas: getItemsFromContainer('riscos-quedas-container'), bronco: getItemsFromContainer('riscos-bronco-container'), iras: getItemsFromContainer('riscos-iras-container') };
                                const getFinalCareItem = (key) => {
                                    const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                                    const items = getItemsFromContainer(`fugulin-${kebabKey}-container`);
                                    return items.length > 0 ? items : (originalPatientState.nursingCare?.[key] || []);
                                };
                                const nursingCareData = { cuidadoCorporal: getFinalCareItem('cuidadoCorporal'), motilidade: getFinalCareItem('motilidade'), deambulacao: getFinalCareItem('deambulacao'), alimentacao: getFinalCareItem('alimentacao'), eliminacao: getFinalCareItem('eliminacao') };
                                const evolutionText = document.getElementById('form-evolution').value.trim();
                                const pendingObsText = document.getElementById('form-pending-obs').value.trim();
                                const monitoringDataForHistory = {};
                                ['pa', 'fc', 'fr', 'sato2', 'temp', 'hgt', 'others'].forEach(key => {
                                    const value = document.getElementById(`form-sv-${key}`).value.trim();
                                    if (value) monitoringDataForHistory[key] = value;
                                });
                                monitoringDataForHistory.o2Supplement = document.getElementById('form-sv-o2').checked;
                                const conscienciaTag = document.querySelector('#monitoring-consciencia-container .item-text');
                                if (conscienciaTag) monitoringDataForHistory.consciencia = [conscienciaTag.dataset.value];
                                const scheduledExamsToSave = patientExams.filter(e => e.status === 'scheduled');
                                const pendingExamsToSave = patientExams.filter(e => e.status === 'pending');
                                const completedExamsThisShift = [...currentShiftCompletedExams];

                                const handoverData = {
                                    professionalId: currentUser.uid, professionalName: currentUser.displayName,
                                    timestamp: serverTimestamp(),
                                    evolution: evolutionText,
                                    pendingObs: pendingObsText,
                                    monitoring: monitoringDataForHistory,
                                    nursingCare: nursingCareData,
                                    news2: news2Result,
                                    fugulin: fugulinResult,
                                    risks: currentRisks,
                                    examsDone: completedExamsThisShift,
                                    diagnoses: currentDiagnoses,
                                    comorbidities: currentComorbidities,
                                    allergies: currentAllergies,
                                    precautions: currentPrecautions,
                                    devices: devicesToSave,
                                    scheduledExams: scheduledExamsToSave,
                                    pendingExams: pendingExamsToSave,
                                    rescheduledExams: currentShiftRescheduledExams,
                                    medicationsAdministered: administeredToSaveForHistory,
                                    changes: {
                                        diagnoses: calculateDelta(originalPatientState.diagnoses, currentDiagnoses),
                                        comorbidities: calculateDelta(originalPatientState.comorbidities, currentComorbidities),
                                        allergies: calculateDelta(originalPatientState.allergies, currentAllergies),
                                        precautions: calculateDelta(originalPatientState.precautions, currentPrecautions),
                                        devices: calculateDelta(originalPatientState.devices, devicesToSave),
                                        risks: {
                                            lpp: calculateDelta(originalPatientState.risks.lpp, currentRisks.lpp),
                                            quedas: calculateDelta(originalPatientState.risks.quedas, currentRisks.quedas),
                                            bronco: calculateDelta(originalPatientState.risks.bronco, currentRisks.bronco),
                                            iras: calculateDelta(originalPatientState.risks.iras, currentRisks.iras),
                                        },
                                        nursingCare: {
                                            cuidadoCorporal: calculateDelta(originalPatientState.nursingCare.cuidadoCorporal, nursingCareData.cuidadoCorporal),
                                            motilidade: calculateDelta(originalPatientState.nursingCare.motilidade, nursingCareData.motilidade),
                                            deambulacao: calculateDelta(originalPatientState.nursingCare.deambulacao, nursingCareData.deambulacao),
                                            alimentacao: calculateDelta(originalPatientState.nursingCare.alimentacao, nursingCareData.alimentacao),
                                            eliminacao: calculateDelta(originalPatientState.nursingCare.eliminacao, nursingCareData.eliminacao),
                                        },
                                        fugulinScoreChange: (originalPatientState.lastFugulinScore !== fugulinResult.score) ? { from: originalPatientState.lastFugulinScore || 'N/A', to: fugulinResult.score } : null,
                                        scheduledExams: calculateDeltaForExams(originalPatientState.scheduledExams, scheduledExamsToSave),
                                        pendingExams: calculateDeltaForExams(originalPatientState.pendingExams, pendingExamsToSave),
                                        medications: medicationChanges,
                                    }
                                };

                                const patientUpdateData = {
                                    lastUpdatedAt: serverTimestamp(),
                                    lastProfessionalName: currentUser.displayName,
                                    activeDiagnoses: currentDiagnoses,
                                    activeComorbidities: currentComorbidities,
                                    activeAllergies: currentAllergies,
                                    activeDevices: devicesToSave,
                                    activePrecautions: currentPrecautions,
                                    activeRisks: currentRisks,
                                    activeNursingCare: nursingCareData,
                                    activeScheduledExams: scheduledExamsToSave,
                                    activePendingExams: pendingExamsToSave,
                                    lastNews2Score: news2Result.score,
                                    lastNews2Level: news2Result.level,
                                    lastFugulinScore: fugulinResult.score,
                                    lastFugulinClassification: fugulinResult.classification,
                                    activeMedicationPrescriptions: prescriptionsToSave,
                                    lastEvolution: evolutionText,
                                    lastPendingObs: pendingObsText,
                                    completedExams: arrayUnion(...completedExamsThisShift)
                                };

                                batch.set(newHandoverRef, handoverData);
                                batch.update(patientRef, patientUpdateData);
                                await batch.commit();

                                showToast("Passagem de plantão salva com sucesso!");
                                currentPatientData = { ...currentPatientData, ...patientUpdateData };
                                
                                // Atualiza o estado original para o próximo ciclo
                                originalPatientState = { ...originalPatientState, ...patientUpdateData, activeMedicationPrescriptions: JSON.parse(JSON.stringify(activePrescriptions)), monitoring: finalVitalsForSave, evolution: evolutionText, pendingObs: pendingObsText };

                                const patientIndex = currentPatientList.findIndex(p => p.id === currentPatientId);
                                if (patientIndex !== -1) {
                                    currentPatientList[patientIndex] = { ...currentPatientList[patientIndex], ...patientUpdateData, lastUpdatedAt: Timestamp.now() };
                                }

                                const newHandoverForUI = { ...handoverData, id: newHandoverRef.id, timestamp: Timestamp.now() };
                                currentHandovers.unshift(newHandoverForUI);
                                
                                const patientDetailNews2 = document.getElementById('patient-detail-news2');
                                const patientDetailFugulin = document.getElementById('patient-detail-fugulin');

                                if (patientUpdateData.lastNews2Score !== undefined && patientUpdateData.lastNews2Level) {
                                    const news2Classes = { 'Risco Baixo': 'news2-low', 'Risco Baixo-Médio': 'news2-low-medium', 'Risco Médio': 'news2-medium', 'Risco Alto': 'news2-high' };
                                    const badgeClass = news2Classes[patientUpdateData.lastNews2Level] || 'bg-gray-100 text-gray-800';
                                    patientDetailNews2.innerHTML = `<span class="text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeClass}">NEWS: ${patientUpdateData.lastNews2Score} - ${patientUpdateData.lastNews2Level}</span>`;
                                }

                                if (patientUpdateData.lastFugulinClassification) {
                                    const fugulinClasses = { 'Cuidados Mínimos': 'fugulin-minimos', 'Cuidados Intermediários': 'fugulin-intermediarios', 'Cuidados de Alta Dependência': 'fugulin-alta-dependencia', 'Cuidados Semi-Intensivos': 'fugulin-semi-intensivos', 'Cuidados Intensivos': 'fugulin-intensivos' };
                                    const badgeClass = fugulinClasses[patientUpdateData.lastFugulinClassification] || 'bg-gray-100 text-gray-800';
                                    patientDetailFugulin.innerHTML = `<span class="status-badge text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeClass}">Fugulin: ${patientUpdateData.lastFugulinScore} - ${patientUpdateData.lastFugulinClassification}</span>`;
                                }

                                renderHandoversList(currentHandovers);
                                partiallyResetFormForNewShift();

                            } catch (error) {
                                console.error("Erro ao salvar passagem de plantão:", error);
                                showToast(`Erro ao salvar: ${error.message}`, 'error');
                            } finally {
                                submitButton.disabled = false;
                                submitButton.textContent = 'Salvar Passagem de Plantão';
                                setUnsavedChanges(false);
                            }
                        });
                        addHandoversForm.addEventListener('input', updateLiveScores);

                        const o2Checkbox = document.getElementById('form-sv-o2');
                        if (o2Checkbox) {
                            o2Checkbox.addEventListener('change', updateLiveScores);
                        }
                    }
                    
                    patientDetailListenersAttached = true;
                }

                updateAllergyPlaceholder();
                resetMonitoringModule();
                updateLiveScores();

                showScreen('patientDetail');
                loadHandovers(patientId);
                
                // Inicia um timer para atualizar a UI de medicações a cada minuto
                medicationUITimer = setInterval(renderMedicationLists, 60000);

            } catch (error) {
                console.error("Erro ao carregar detalhes do paciente:", error);
                showToast('Erro ao carregar detalhes do paciente.', 'error');
                showScreen('main');
            } finally {
                hideActionLoader();
            }
        }


        async function loadHandovers(patientId) {
            if (unsubscribeHandovers) unsubscribeHandovers();

            const handoversRef = collection(db, 'patients', patientId, 'handovers');
            const q = query(handoversRef, orderBy('timestamp', 'desc'));

            unsubscribeHandovers = onSnapshot(q, (snapshot) => {
                try {
                    const allHandovers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    currentHandovers = allHandovers;

                    renderHandoversList(allHandovers);

                    // --- INÍCIO DA LÓGICA DE ATUALIZAÇÃO EM TEMPO REAL ---
                    // Verifica se um dos modais de detalhe está aberto
                    const isLastHandoverModalOpen = !lastHandoverModal.classList.contains('hidden');
                    const isViewHandoverModalOpen = !viewHandoverModal.classList.contains('hidden');

                    if (isLastHandoverModalOpen || isViewHandoverModalOpen) {
                        // Encontra o handover que está sendo visualizado na nova lista de dados
                        const updatedHandoverData = allHandovers.find(h => h.id === currentlyViewedHandover.id);
                        
                        if (updatedHandoverData) {
                            currentlyViewedHandover = updatedHandoverData; // Atualiza a variável global
                            // Repopula o modal que estiver aberto com os novos dados (incluindo o novo adendo)
                            if (isLastHandoverModalOpen) {
                                populateLastHandoverModal();
                            }
                            if (isViewHandoverModalOpen) {
                                populateHandoverViewModal(updatedHandoverData);
                            }
                        }
                    }
                    // --- FIM DA LÓGICA DE ATUALIZAÇÃO EM TEMPO REAL ---

                } catch (error) {
                    console.error("Erro ao processar o snapshot do histórico:", error);
                    showToast("Erro ao carregar atualizações do histórico.", "error");
                }
            }, (error) => {
                console.error("Erro de conexão ao buscar histórico:", error);
                showToast("Não foi possível conectar para buscar o histórico.", "error");
            });
        }

        /**
         * Cria o corpo HTML detalhado de um registro de handover.
         * É robusto para lidar com formatos de dados antigos e novos (legado).
         * @param {object} handover - O objeto de handover do Firestore.
         * @returns {string} - Uma string HTML contendo a lista de detalhes.
         */
        function createHandoverDetailHtml(handover) {
            // Helper interno para renderizar um campo somente se ele tiver valor
            const renderField = (label, value) => {
                if (!value || (typeof value === 'string' && value.trim() === '')) return '';
                return `<div class="py-2 sm:grid sm:grid-cols-3 sm:gap-4"><dt class="text-sm font-medium text-gray-600">${label}</dt><dd class="mt-1 text-sm text-gray-800 sm:mt-0 sm:col-span-2 whitespace-pre-wrap">${value}</dd></div>`;
            };

            let detailHtml = '<dl>';

            // --- Seção de Evolução e Alterações de Estado ---
            // Lida com campos de nomes antigos (legado) usando ||
            detailHtml += renderField('Evolução / Plano', handover.evolution || handover.clinicalSituation?.evolution);

            if (handover.fugulin) {
                detailHtml += renderField('Classificação Fugulin', `<strong>${handover.fugulin.score} - ${handover.fugulin.classification}</strong>`);
            }

            const { changes } = handover;
            if (changes) {
                const changeLog = [];
                const renderChangeList = (items, prefix, icon) => items.map(item => `<li>${icon} ${prefix}: <strong>${item}</strong></li>`).join('');
                
                if (changes.diagnoses?.added?.length) changeLog.push(renderChangeList(changes.diagnoses.added, 'Adicionado Diagnóstico', '✅'));
                if (changes.diagnoses?.removed?.length) changeLog.push(renderChangeList(changes.diagnoses.removed, 'Removido Diagnóstico', '❌'));
                // Adicione mais lógicas de 'changes' aqui se necessário (comorbidades, alergias, etc.)

                if (changeLog.length > 0) {
                    detailHtml += `<div class="py-2"><dt class="text-sm font-medium text-gray-600">Alterações de Estado:</dt><dd><ul class="list-none mt-1 text-sm space-y-1">${changeLog.join('')}</ul></dd></div>`;
                }
            }

            // --- Seção de Medicações ---
            if (handover.medications && handover.medications.length > 0) {
                const medsHtml = `<ul class="list-none space-y-1">${handover.medications.map(m => 
                    `<li>💊 <strong>${m.name}</strong> às ${m.times.map(
                        ts => new Date(ts).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})
                    ).join(', ')}</li>`
                ).join('')}</ul>`;
                detailHtml += renderField('Medicações Administradas', medsHtml);
            }
            
            // --- Seção de Exames (Lógica Robusta) ---
            const examsDoneData = handover.examsDone;
            let examsDoneHtml = '';
            if (Array.isArray(examsDoneData) && examsDoneData.length > 0) {
                // Formato NOVO (array de objetos)
                examsDoneHtml = '<ul class="list-none space-y-1 pl-2">' + examsDoneData.map(exam => `<li><strong>${exam.name}:</strong> ${exam.result}</li>`).join('') + '</ul>';
            } else if (typeof examsDoneData === 'string' && examsDoneData.trim() !== '') {
                // Formato ANTIGO (string)
                examsDoneHtml = `<p class="whitespace-pre-wrap">${examsDoneData}</p>`;
            }
            detailHtml += renderField('Exames Realizados', examsDoneHtml);

            // --- Seção de Monitoramento ---
            const mon = handover.monitoring;
            if (mon && Object.values(mon).some(v => v)) {
                const monitoringText = `PA: ${mon.pa||'-'} | FC: ${mon.fc||'-'} | FR: ${mon.fr||'-'} | SatO2: ${mon.sato2||'-'} | Temp: ${mon.temp||'-'} | HGT: ${mon.hgt||'-'}`;
                detailHtml += renderField('📈 Monitoramento', monitoringText);
                detailHtml += renderField('Outros (Diurese/Dreno)', mon.others);
            }

            // --- Seção de Pendências (Lógica Robusta com Legado) ---
            detailHtml += renderField('⚠️ Pendências', handover.pendingObs || handover.pending?.description);

            detailHtml += '</dl>';
            return detailHtml;
        }

        // --- FUNÇÕES DE RENDERIZAÇÃO DE PLANTÕES ---

        /**
         * Renderiza o histórico de plantões com um sistema de paginação DENTRO DO MODAL.
         * @param {object[]} handovers - A lista completa de todos os handovers.
         */
        function renderHandoversList(handovers) {
            const modalContent = document.getElementById('full-history-content');
            const modalPagination = document.getElementById('full-history-pagination');

            // Limpa o conteúdo anterior do modal
            modalContent.innerHTML = '';
            modalPagination.innerHTML = '';

            if (handovers.length === 0) {
                // Se não há histórico, o modal mostrará uma mensagem vazia, o que está correto.
                return;
            }

            // --- LÓGICA DE PAGINAÇÃO ---
            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.ceil(handovers.length / ITEMS_PER_PAGE);
            if (currentHistoryPage > totalPages) currentHistoryPage = totalPages > 0 ? totalPages : 1;

            const startIndex = (currentHistoryPage - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const paginatedHandovers = handovers.slice(startIndex, endIndex);

            // --- RENDERIZAÇÃO DA LISTA DE ITENS DA PÁGINA ATUAL NO MODAL ---
            paginatedHandovers.forEach(h => {
                const hDate = h.timestamp?.toDate ? h.timestamp.toDate() : new Date();
                const hFormattedDate = hDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const hFormattedTime = hDate.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                const historyItem = document.createElement('button');
                historyItem.className = 'history-item-button';
                historyItem.dataset.handoverId = h.id;
                
                historyItem.innerHTML = `
                    <div class="history-item-info">
                        <div class="history-item-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        </div>
                        <div>
                            <p class="font-semibold text-gray-800">${h.professionalName || 'Profissional não identificado'}</p>
                            <p class="text-sm text-gray-500">${hFormattedDate} às ${hFormattedTime}</p>
                        </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                `;
                modalContent.appendChild(historyItem);
            });

            // --- RENDERIZAÇÃO DOS CONTROLES DE PAGINAÇÃO ---
            if (totalPages > 1) {
                let paginationHtml = '<div class="flex items-center justify-between w-full">';

                // Botão "Anterior"
                paginationHtml += `<button data-page="${currentHistoryPage - 1}" class="page-button flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 ${currentHistoryPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${currentHistoryPage === 1 ? 'disabled' : ''}>&larr; Anterior</button>`;

                // Indicador de página
                paginationHtml += `<span class="text-sm text-gray-700">Página <strong>${currentHistoryPage}</strong> de <strong>${totalPages}</strong></span>`;

                // Botão "Próximo"
                paginationHtml += `<button data-page="${currentHistoryPage + 1}" class="page-button flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 ${currentHistoryPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${currentHistoryPage === totalPages ? 'disabled' : ''}>Próximo &rarr;</button>`;

                paginationHtml += '</div>';
                modalPagination.innerHTML = paginationHtml;
            }
        }

        // Esta função cria uma seção do modal, com título, ícone e conteúdo.
        // Se o conteúdo for vazio, ela exibe uma mensagem padrão.
        function renderSummarySection(title, icon, content) {
            let bodyHtml;

            // Se o conteúdo estiver vazio (null ou string vazia), mostra a mensagem padrão.
            if (!content || content.trim() === '') {
                bodyHtml = '<p class="text-gray-500 italic px-2">Nenhum registro encontrado.</p>';
            } else {
                // Se houver conteúdo, exibe-o.
                bodyHtml = `<div class="text-gray-700 space-y-2 px-2">${content}</div>`;
            }

            return `
                <div class="mb-5">
                    <h3 class="text-lg font-semibold text-gray-800 border-b pb-2 mb-3 flex items-center">${icon} ${title}</h3>
                    ${bodyHtml}
                </div>
            `;
        }
        
        /**
         * Salva um novo adendo em um registro de handover específico no Firestore,
         * criando e enviando notificações para todos os profissionais envolvidos.
         * @param {string} handoverId - O ID do documento de handover.
         * @param {string} adendoText - O texto do adendo.
         * @param {HTMLButtonElement} submitButton - O botão que acionou o salvamento.
         */
        async function saveAdendo(handoverId, adendoText, submitButton) {
            if (!adendoText.trim()) {
                showToast("O texto do adendo não pode estar vazio.", "error");
                return;
            }

            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = 'Salvando...';

            try {
                const handoverRef = doc(db, 'patients', currentPatientId, 'handovers', handoverId);
                
                // 1. Busca os dados atuais do handover para identificar os envolvidos
                const handoverSnap = await getDoc(handoverRef);
                if (!handoverSnap.exists()) {
                    throw new Error("A passagem de plantão original não foi encontrada.");
                }
                const handoverData = handoverSnap.data();

                // 2. Monta a lista de destinatários da notificação (usando um Set para evitar duplicatas)
                const recipients = new Set();
                
                // Adiciona o autor original do plantão
                if (handoverData.professionalId) {
                    recipients.add(handoverData.professionalId);
                }
                
                // Adiciona todos que já fizeram adendos anteriormente
                if (Array.isArray(handoverData.adendos)) {
                    handoverData.adendos.forEach(adendo => {
                        if (adendo.professionalId) {
                            recipients.add(adendo.professionalId);
                        }
                    });
                }
                
                // Garante que não notificamos o próprio autor do adendo atual
                recipients.delete(currentUser.uid);

                console.log(`[saveAdendo] Adendo salvo por ${currentUser.displayName}. Notificando ${recipients.size} usuários:`, Array.from(recipients));

                // 3. Prepara o novo adendo
                const newAdendoData = {
                    text: adendoText.trim(),
                    professionalId: currentUser.uid,
                    professionalName: currentUser.displayName,
                    timestamp: new Date() // Usar new Date() é mais confiável para arrayUnion
                };

                // 4. Cria um "batch" para salvar o adendo e as notificações de uma vez
                const batch = writeBatch(db);

                // Adiciona a atualização do handover ao batch
                batch.update(handoverRef, {
                    adendos: arrayUnion(newAdendoData)
                });

                // 5. Cria uma notificação para cada destinatário
                if (recipients.size > 0) {
                    recipients.forEach(recipientUid => {
                        const notificationRef = doc(collection(db, 'notifications'));
                        batch.set(notificationRef, {
                            recipientUid: recipientUid,
                            actorUid: currentUser.uid,
                            actorName: currentUser.displayName || 'Usuário desconhecido',
                            patientId: currentPatientId,
                            patientName: currentPatientData.name || 'Paciente desconhecido',
                            handoverId: handoverId,
                            type: 'new_adendo',
                            timestamp: serverTimestamp(),
                            read: false
                        });
                    });
                }

                // 6. Executa todas as operações
                await batch.commit();

                showToast("Adendo salvo com sucesso!");

            } catch (error) {
                console.error("Erro ao salvar adendo e criar notificações:", error);
                showToast(`Erro ao salvar: ${error.message}`, 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
                
                // Esconde o formulário após salvar
                const formWrapper = submitButton.closest('.inline-adendo-form-wrapper');
                if (formWrapper) {
                    formWrapper.querySelector('textarea').value = '';
                    formWrapper.classList.add('hidden');
                    formWrapper.closest('.adendos-container').querySelector('.add-adendo-trigger-wrapper').classList.remove('hidden');
                }
            }
        }

        /**
         * Renderiza a lista de adendos, controlando a visibilidade de "último" vs "todos".
         * VERSÃO REFORÇADA: Gerencia explicitamente a visibilidade de todos os elementos
         * para eliminar bugs de estado ao navegar entre modais.
         */
        function renderAdendosList(adendos = [], adendosSection) {
            if (!adendosSection) {
                console.error("renderAdendosList foi chamada sem uma seção de adendos válida.");
                return;
            }

            const listContainer = adendosSection.querySelector('.adendos-list');
            const visibleWrapper = adendosSection.querySelector('[id^="adendos-visible-wrapper"]');
            const toggleBtn = adendosSection.querySelector('.toggle-adendos-view-btn');
            const triggerWrapper = adendosSection.querySelector('.add-adendo-trigger-wrapper');
            const formWrapper = adendosSection.querySelector('.inline-adendo-form-wrapper');

            // --- INÍCIO DA LÓGICA REFORÇADA ---
            
            // Garante que o formulário esteja escondido e o botão de adicionar visível por padrão
            if (formWrapper.classList.contains('hidden')) {
                triggerWrapper.classList.remove('hidden');
            }

            const hasAdendos = adendos && adendos.length > 0;

            if (hasAdendos) {
                // Se HÁ adendos:
                visibleWrapper.classList.remove('hidden');
                triggerWrapper.classList.remove('justify-end');
                triggerWrapper.classList.add('justify-start');
            } else {
                // Se NÃO HÁ adendos:
                visibleWrapper.classList.add('hidden');
                triggerWrapper.classList.remove('justify-start');
                triggerWrapper.classList.add('justify-end');
            }
            
            // --- FIM DA LÓGICA REFORÇADA ---

            if (!hasAdendos) {
                listContainer.innerHTML = '';
                return;
            };

            listContainer.innerHTML = '';
            const sortedAdendos = [...adendos].sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
            const currentState = toggleBtn.dataset.state; // Lê o estado atual
            const itemsToRender = currentState === 'all' ? sortedAdendos : [sortedAdendos[sortedAdendos.length - 1]];

            itemsToRender.forEach(adendo => {
                const date = adendo.timestamp?.toDate ? adendo.timestamp.toDate() : new Date();
                const formattedDate = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                
                const adendoEl = document.createElement('div');
                adendoEl.className = 'adendo-bubble';
                adendoEl.innerHTML = `
                    <p class="text-gray-800 whitespace-pre-wrap">${adendo.text}</p>
                    <p class="adendo-meta">
                        <strong>${adendo.professionalName}</strong> - ${formattedDate}
                    </p>
                `;
                listContainer.appendChild(adendoEl);
            });
            
            // Lógica dos ÍCONES (agora mais explícita)
            const expandIcon = toggleBtn.querySelector('.icon-expand');
            const collapseIcon = toggleBtn.querySelector('.icon-collapse');

            if (sortedAdendos.length > 1) {
                toggleBtn.classList.remove('hidden'); // Garante que o botão apareça
                if (currentState === 'all') {
                    expandIcon.classList.add('hidden');
                    collapseIcon.classList.remove('hidden');
                    toggleBtn.title = 'Ver apenas último adendo';
                } else {
                    expandIcon.classList.remove('hidden');
                    collapseIcon.classList.add('hidden');
                    toggleBtn.title = `Ver todos os ${sortedAdendos.length} adendos`;
                }
            } else {
                toggleBtn.classList.add('hidden'); // Garante que o botão suma se só tiver 1 adendo
            }
            
            listContainer.scrollTop = listContainer.scrollHeight;
        }

        /**
         * FUNÇÃO DE IMPRESSÃO
         * Coleta os dados do resumo semanal, converte o gráfico para imagem e monta um HTML para impressão.
         */
        async function handlePrintSummary() {
            const printView = document.getElementById('print-view');
            if (!currentPatientData || !weeklySummaryChart) {
                showToast("Dados do resumo ainda não carregados. Tente novamente.", "error");
                return;
            }
            
            showToast("Preparando impressão...", 2000);

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const handoversRef = collection(db, 'patients', currentPatientId, 'handovers');
            const q = query(handoversRef, where('timestamp', '>=', Timestamp.fromDate(sevenDaysAgo)), orderBy('timestamp', 'asc'));
            const snapshot = await getDocs(q);
            const recentHandovers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const kpis = processKPIs(recentHandovers);
            const events = processEventsForTable(recentHandovers.slice().reverse());
            const chartImage = weeklySummaryChart.toBase64Image();

            // 1. Tabela de Medicações Administradas
            const allAdministered = recentHandovers.flatMap(h => h.medicationsAdministered || []);
            const administeredSummary = allAdministered.reduce((acc, med) => {
                const key = `${med.name} ${formatDose(med.dose)}`.trim();
                if (!acc[key]) {
                    acc[key] = { count: 0, name: key };
                }
                acc[key].count++;
                return acc;
            }, {});
            const sortedAdministered = Object.values(administeredSummary).sort((a, b) => b.count - a.count);
            
            let administeredHtml = '<tr><td colspan="2" style="text-align: center; padding: 10px; border: 1px solid #ddd;">Nenhuma medicação administrada na semana.</td></tr>';
            if (sortedAdministered.length > 0) {
                administeredHtml = sortedAdministered.map(med => `
                    <tr style="page-break-inside: avoid;">
                        <td style="border: 1px solid #ddd; padding: 4px;">${med.name}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center;">${med.count}x</td>
                    </tr>
                `).join('');
            }

            // 2. Tabela de Alterações de Prescrição
            let changesHtml = '';
            recentHandovers.forEach(h => {
                const medChanges = h.changes?.medications;
                if (!medChanges) return;

                const timestamp = h.timestamp.toDate().toLocaleString('pt-BR', {day: '2-digit', month: '2-digit'});

                if (medChanges.added?.length > 0) {
                    changesHtml += medChanges.added.map(m => `
                        <tr style="page-break-inside: avoid;">
                            <td style="border: 1px solid #ddd; padding: 4px;">[${timestamp}] <span style="color: #2563eb;">+</span> ${formatPrescriptionForHistory(m)}</td>
                        </tr>`).join('');
                }
                if (medChanges.modified?.length > 0) {
                    changesHtml += medChanges.modified.map(mod => `
                        <tr style="page-break-inside: avoid;">
                            <td style="border: 1px solid #ddd; padding: 4px;">[${timestamp}] <span style="color: #d97706;">🔄</span> ${formatPrescriptionForHistory(mod.after)} (Antes: ${mod.before.frequency}h/${mod.before.duration}d)</td>
                        </tr>`).join('');
                }
                if (medChanges.suspended?.length > 0) {
                    changesHtml += medChanges.suspended.map(m => `
                        <tr style="page-break-inside: avoid;">
                            <td style="border: 1px solid #ddd; padding: 4px;">[${timestamp}] <span style="color: #dc2626;">❌</span> Suspenso ${formatPrescriptionForHistory(m)}</td>
                        </tr>`).join('');
                }
            });
            if (changesHtml === '') {
                changesHtml = '<tr><td style="text-align: center; padding: 10px; border: 1px solid #ddd;">Nenhuma alteração de prescrição na semana.</td></tr>';
            }

            const { name, patientNumber, roomNumber, dob } = currentPatientData;
            const age = calculateAge(dob);

            printView.innerHTML = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                        <h1 style="font-size: 24px; margin: 0;">Resumo Clínico da Semana</h1>
                        <h2 style="font-size: 18px; margin: 5px 0;">${name}</h2>
                        <p style="font-size: 12px; margin: 0;">
                            <strong>Leito:</strong> ${roomNumber} | 
                            <strong>Prontuário:</strong> ${patientNumber} | 
                            <strong>Idade:</strong> ${age} anos
                        </p>
                    </div>

                    <div style="margin-bottom: 20px; page-break-inside: avoid;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Destaques da Semana</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                           <tbody>
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Pico de FC:</strong> ${kpis.maxFC.value || 'N/A'} bpm</td>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Menor PAS:</strong> ${kpis.minPAS.value || 'N/A'} mmHg</td>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Pico Febril:</strong> ${kpis.maxTemp.value ? kpis.maxTemp.value.toFixed(1) : 'N/A'} °C</td>
                                </tr>
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Menor SatO₂:</strong> ${kpis.minSatO2.value || 'N/A'} %</td>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Pico de FR:</strong> ${kpis.maxFR.value || 'N/A'} irpm</td>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Maior NEWS2:</strong> ${kpis.maxNEWS2.value || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Hipoglicemias:</strong> ${kpis.hypoglycemiaEpisodes.count}</td>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Episódios de Febre:</strong> ${kpis.feverEpisodes.count}</td>
                                    <td style="border: 1px solid #ddd; padding: 5px;"><strong>Meds SOS:</strong> ${kpis.sosMedCount.count} doses</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-bottom: 20px; page-break-inside: avoid;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Tendências de Sinais Vitais e Scores</h3>
                        <img src="${chartImage}" style="width: 100%; max-width: 100%; border: 1px solid #eee;" alt="Gráfico de Tendências"/>
                    </div>

                    <div style="margin-top: 25px; page-break-before: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Medicações Administradas</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                <thead style="background-color: #f2f2f2; text-align: left;">
                                    <tr>
                                        <th style="border: 1px solid #ddd; padding: 5px;">Medicação</th>
                                        <th style="border: 1px solid #ddd; padding: 5px; text-align: center; width: 80px;">Doses</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${administeredHtml}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Alterações de Prescrição</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                <thead style="background-color: #f2f2f2; text-align: left;">
                                    <tr>
                                        <th style="border: 1px solid #ddd; padding: 5px;">Evento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${changesHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div style="margin-top: 25px; page-break-before: auto;">
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Linha do Tempo de Eventos Relevantes</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead style="background-color: #f2f2f2; text-align: left;">
                                <tr>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Data/Hora</th>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Categoria</th>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Evento / Descrição</th>
                                    <th style="border: 1px solid #ddd; padding: 5px;">Profissional</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${events.map(event => `
                                    <tr style="page-break-inside: avoid;">
                                        <td style="border: 1px solid #ddd; padding: 5px; white-space: nowrap;">${event.timestamp.toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</td>
                                        <td style="border: 1px solid #ddd; padding: 5px; white-space: nowrap;">${event.category}</td>
                                        <td style="border: 1px solid #ddd; padding: 5px;">${event.description}</td>
                                        <td style="border: 1px solid #ddd; padding: 5px;">${event.professional}</td>
                                    </tr>
                                `).join('')}
                                ${events.length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: 10px; border: 1px solid #ddd;">Nenhum evento relevante.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            setTimeout(() => {
                window.print();
            }, 200);
        }

        /**
         * Orquestra a busca de dados e a renderização do novo modal de resumo da semana.
         */
        async function showWeeklySummary() {
            const loader = document.getElementById('summary-loader');
            const contentContainer = document.getElementById('summary-main-container');
            const titleElement = document.getElementById('patient-summary-title');
            const subtitle = document.getElementById('patient-summary-subtitle');
            
            // Define o título estático e preenche o nome do paciente de forma destacada
            if (titleElement) {
                titleElement.textContent = 'Resumo Clínico da Semana';
            }
            if (titleElement && currentPatientData) {
                titleElement.innerHTML = `Resumo Clínico Semanal: <span class="font-bold text-gray-800">${currentPatientData.name || 'Paciente'}</span>`;
            }

            // 1. Prepara a UI: mostra o loader e esconde o conteúdo
            loader.style.display = 'block';
            contentContainer.classList.add('hidden');
            subtitle.textContent = `Analisando dados dos últimos 7 dias...`;
            patientSummaryModal.classList.remove('hidden');

            try {
                // 2. Define o período de busca (últimos 7 dias)
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

                // 3. Busca os plantões do paciente no período
                const handoversRef = collection(db, 'patients', currentPatientId, 'handovers');
                const q = query(handoversRef, where('timestamp', '>=', sevenDaysAgoTimestamp), orderBy('timestamp', 'asc')); // asc para o gráfico
                
                const snapshot = await getDocs(q);
                const recentHandovers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (recentHandovers.length === 0) {
                    loader.innerHTML = '<p class="text-gray-600 p-10">Nenhum registro encontrado nos últimos 7 dias.</p>';
                    return;
                }
                
                // 4. CHAMA AS FUNÇÕES PARA PROCESSAR E RENDERIZAR CADA BLOCO
                // (Estas funções serão criadas nos próximos passos)
                
                // PASSO 1: KPIs
                const kpis = processKPIs(recentHandovers);
                renderKPIs(kpis);

                // PASSO 3: Gráfico
                const chartData = prepareChartData(recentHandovers);
                renderTrendsChart(chartData);
                
                // PASSO 2: Tabela de Eventos
                const events = processEventsForTable(recentHandovers.slice().reverse()); // Passa uma cópia revertida para a tabela
                renderEventsTable(events);
                
                // 5. Finaliza a UI: esconde o loader e mostra o conteúdo
                subtitle.textContent = `Dados de ${sevenDaysAgo.toLocaleDateString('pt-BR')} até hoje.`;
                loader.style.display = 'none';
                contentContainer.classList.remove('hidden');

            } catch (error) {
                console.error("Erro ao gerar resumo da semana:", error);
                loader.innerHTML = `<p class="text-red-600 p-10">Ocorreu um erro ao buscar os dados: ${error.message}</p>`;
                showToast("Erro ao carregar o resumo da semana.", "error");
            }
        }

        /**
         * NOVA FUNÇÃO MESTRE PARA HISTORICO DE PLANTAO
         * Gera o corpo HTML detalhado e estilizado para QUALQUER registro de handover.
         * Esta função centraliza a lógica de exibição para garantir consistência visual.
         * @param {object} handover - O objeto de handover do Firestore.
         * @returns {string} - Uma string HTML contendo o conteúdo detalhado do modal.
         */
        function generateDetailedHandoverHtml(handover) {
            if (!handover) return '<p class="text-center text-gray-500 italic">Dados da passagem de plantão não encontrados.</p>';

            // Mapeamento de títulos para exibição correta
            const titleMap = {
                cuidadoCorporal: 'Cuidado Corporal / Pele',
                motilidade: 'Motilidade / Movimentação',
                deambulacao: 'Deambulação',
                alimentacao: 'Alimentação / Hidratação',
                eliminacao: 'Cuidado com Eliminações'
            };

            const formatDate = (timestamp) => {
                if (!timestamp) return 'Data indefinida';
                const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            };

            const renderListAsCommaString = (items) => {
                if (!items || items.length === 0) return '<span class="text-gray-500 text-xs italic">Nenhum registro.</span>';
                return items.join(', ');
            };

            const renderObjectAsList = (obj, map) => {
                const entries = Object.entries(obj).filter(([_, v]) => v && v.length > 0);
                if (entries.length === 0) return '<span class="text-gray-500 text-xs italic">Nenhum registro.</span>';
                
                return `<ul>${entries.map(([key, value]) => `<li><strong>${map[key] || key}:</strong> ${value.join(', ')}</li>`).join('')}</ul>`;
            };

            let contentHtml = '';

            // Seção: Diagnóstico e Evolução
            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">⚕️ Diagnóstico e Evolução</h3>
                <div class="summary-item"><span class="summary-item-label">Diagnósticos:</span><span class="summary-item-value">${renderListAsCommaString(handover.diagnoses)}</span></div>
                <div class="summary-item"><span class="summary-item-label">Comorbidades:</span><span class="summary-item-value">${renderListAsCommaString(handover.comorbidities)}</span></div>
                <div class="summary-item"><span class="summary-item-label">Alergias:</span><span class="summary-item-value">${renderListAsCommaString(handover.allergies)}</span></div>
                <div class="summary-item"><span class="summary-item-label">Evolução / Plano do Plantão:</span><p class="summary-item-value whitespace-pre-wrap">${handover.evolution || '<span class="text-gray-500 text-xs italic">Nenhuma.</span>'}</p></div>
            </div>`;

            // Seção: Segurança do Paciente
            let risksHtml = '<span class="text-gray-500 text-xs italic">Nenhum risco avaliado.</span>';
            if (handover.risks && Object.values(handover.risks).some(v => v && v.length > 0)) {
                const riskLabelMap = { lpp: 'LPP', quedas: 'Quedas', bronco: 'Broncoaspiração', iras: 'IRAS' };
                risksHtml = Object.entries(handover.risks)
                    .filter(([_, value]) => value && value.length > 0)
                    .map(([key, value]) => `<strong>${riskLabelMap[key] || key}:</strong> ${value.join(', ')}`)
                    .join('<br>');
            }
            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">🛡️ Segurança do Paciente</h3>
                <div class="summary-item"><span class="summary-item-label">Riscos Assistenciais:</span><div class="summary-item-value">${risksHtml}</div></div>
                <div class="summary-item"><span class="summary-item-label">Precauções:</span><span class="summary-item-value">${renderListAsCommaString(handover.precautions)}</span></div>
                <div class="summary-item"><span class="summary-item-label">Dispositivos:</span><span class="summary-item-value">${renderListAsCommaString(handover.devices)}</span></div>
            </div>`;
            
            // Seção: Cuidados de Enfermagem
            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">🩺 Cuidados de Enfermagem</h3>
                <div class="summary-item-value">${renderObjectAsList(handover.nursingCare || {}, titleMap)}</div>
            </div>`;
            
            // Seção: Monitoramento e Scores
            const mon = handover.monitoring;
            let monitoringDetailsHtml = '<span class="text-gray-500 text-xs italic">Nenhum dado de monitoramento registrado.</span>';
            if (mon && Object.values(mon).some(v => v)) {
                const fields = [{ label: 'PA', value: mon.pa }, { label: 'FC', value: mon.fc }, { label: 'FR', value: mon.fr }, { label: 'SatO₂', value: mon.sato2 }, { label: 'Temp', value: mon.temp }, { label: 'HGT', value: mon.hgt }];
                monitoringDetailsHtml = fields.filter(f => f.value).map(f => `<strong>${f.label}:</strong> ${f.value}`).join(' | ');
                if (mon.others) {
                    monitoringDetailsHtml += `<div class="mt-2"><span class="summary-item-label">Diurese / Drenos / Outros:</span><p class="summary-item-value whitespace-pre-wrap">${mon.others}</p></div>`;
                }
            }
            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">📈 Monitoramento e Scores</h3>
                <div class="summary-item"><span class="summary-item-label">Scores:</span><span class="summary-item-value"><strong>NEWS:</strong> ${handover.news2?.score ?? 'N/A'} (${handover.news2?.level ?? 'N/A'}) | <strong>Fugulin:</strong> ${handover.fugulin?.score ?? 'N/A'} (${handover.fugulin?.classification ?? 'N/A'})</span></div>
                <div class="summary-item mt-3"><span class="summary-item-label">Sinais Vitais Registrados:</span><div class="summary-item-value">${monitoringDetailsHtml}</div></div>
            </div>`;

            // Seção: Medicações
            let medsHtml = '';
            const medChanges = handover.changes?.medications;
            if (medChanges && (medChanges.administered?.length > 0 || medChanges.added?.length > 0 || medChanges.suspended?.length > 0 || medChanges.modified?.length > 0)) {
                let log = '<ul>';
                if (medChanges.administered?.length > 0) {
                    log += medChanges.administered.map(m => `<li><span style="color: #16a34a;">✓</span> Administrou <strong>${m.name} ${m.dose}</strong></li>`).join('');
                }
                if (medChanges.added?.length > 0) {
                    log += medChanges.added.map(m => `<li><span style="color: #2563eb;">+</span> Prescreveu ${formatPrescriptionForHistory(m)}</li>`).join('');
                }
                if (medChanges.suspended?.length > 0) {
                    log += medChanges.suspended.map(m => `<li><span style="color: #dc2626;">❌</span> Suspendeu ${formatPrescriptionForHistory(m)}</li>`).join('');
                }
                if (medChanges.modified?.length > 0) {
                    log += medChanges.modified.map(m => `<li><span style="color: #d97706;">🔄</span> Modificou prescrição de ${formatPrescriptionForHistory(m)}</li>`).join('');
                }
                log += '</ul>';
                medsHtml = log;
            }

            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">💉 Medicações</h3>
                ${medsHtml || '<span class="text-gray-500 text-xs italic">Nenhuma atividade de medicação registrada neste plantão.</span>'}
            </div>`;

            // Seção: Exames e Procedimentos
            let examsHtml = '';
            if (handover.examsDone?.length > 0) examsHtml += `<div class="summary-item"><span class="summary-item-label">Resultados no Plantão:</span><div class="summary-item-value"><ul>${handover.examsDone.map(e => `<li><strong>${e.name}:</strong> ${e.result || 'não informado'} <span class="text-xs text-gray-500 italic">- Em ${formatDate(e.timestamp)}</span></li>`).join('')}</ul></div></div>`;
            if (handover.scheduledExams?.length > 0) examsHtml += `<div class="summary-item"><span class="summary-item-label">Deixou Agendado:</span><div class="summary-item-value"><ul>${handover.scheduledExams.map(e => `<li><strong>${e.name}</strong> - <span class="text-xs text-gray-500 italic">Para ${formatDate(e.timestamp)}</span></li>`).join('')}</ul></div></div>`;
            if (handover.pendingExams?.length > 0) examsHtml += `<div class="summary-item"><span class="summary-item-label">Deixou Pendente de Resultado:</span><div class="summary-item-value"><ul>${handover.pendingExams.map(e => `<li><strong>${e.name}</strong> - <span class="text-xs text-gray-500 italic">Realizado em ${formatDate(e.timestamp)}</span></li>`).join('')}</ul></div></div>`;
            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">🧪 Exames e Procedimentos</h3>
                ${examsHtml || '<span class="text-gray-500 text-xs italic">Nenhuma atividade de exame registrada.</span>'}
            </div>`;
            
            // Seção: Observações
            contentHtml += `<div class="summary-section">
                <h3 class="summary-section-header">📝 Observações e Pendências</h3>
                <p class="summary-item-value whitespace-pre-wrap">${handover.pendingObs || '<span class="text-gray-500 text-xs italic">Nenhuma.</span>'}</p>
            </div>`;

            return contentHtml;
        }

        /**
         * Preenche o modal de visualização de um handover específico.
         * VERSÃO FINAL: Reseta COMPLETAMENTE o estado da UI de adendos a cada abertura.
         */
        function populateHandoverViewModal(handover) {
            if (!handover) return;

            currentlyViewedHandover = handover;

            const viewHandoverMainTitle = document.getElementById('view-handover-main-title');
            
            const viewHandoverSubtitle = document.getElementById('view-handover-subtitle');
            const viewHandoverContent = document.getElementById('view-handover-content');
            const adendosSection = document.getElementById('view-handover-adendos-section'); 

            // Garante que, ao abrir o modal, a UI de adendos esteja no estado inicial.
            const formWrapper = adendosSection.querySelector('.inline-adendo-form-wrapper');
            const triggerWrapper = adendosSection.querySelector('.add-adendo-trigger-wrapper');
            const toggleBtn = adendosSection.querySelector('.toggle-adendos-view-btn');
            
            formWrapper.classList.add('hidden');        // 1. Esconde o formulário
            triggerWrapper.classList.remove('hidden'); // 2. Garante que o botão de adicionar esteja visível
            formWrapper.querySelector('textarea').value = ''; // 3. Limpa o texto
            toggleBtn.dataset.state = 'last';             // 4. Reseta o estado da setinha para "recolhido"

            const date = handover.timestamp?.toDate ? handover.timestamp.toDate() : new Date();
            const formattedDate = date.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' });

            // Preenche o nome do paciente
            if (viewHandoverMainTitle && currentPatientData) {
                viewHandoverMainTitle.innerHTML = `Detalhes do Plantão: <span class="font-bold text-gray-800">${currentPatientData.name || 'Paciente'}</span>`;
            }
            // Preenche o subtítulo com os dados do plantão
            viewHandoverSubtitle.innerHTML = `Registrado por <strong>${handover.professionalName || 'N/A'}</strong> em ${formattedDate}`;
            viewHandoverContent.innerHTML = generateDetailedHandoverHtml(handover);
            
            renderAdendosList(handover.adendos, adendosSection);
        }

        
        /**
         * Controla a visibilidade do título "Alergias Conhecidas" com base no modo de edição.
         * O rótulo e o campo de texto aparecem APENAS quando o módulo está em edição.
         */
        function updateAllergyTitleVisibility() {
            // Referência ao elemento que contém o rótulo e o input,
            // ou o contêiner principal do módulo de alergias.
            const allergyModuleBox = document.querySelector('.allergy-module-box'); 
            
            // Referência ao rótulo a ser exibido/ocultado.
            const label = document.getElementById('allergy-description-label');
            
            // Referência ao grupo de input de alergias
            const inputGroup = document.getElementById('allergy-input-group');

            if (!allergyModuleBox || !label || !inputGroup) return;

            // A nova regra: verifica se a caixa principal está no modo de edição.
            if (allergyModuleBox.classList.contains('module-editing')) {
                // Se estiver no modo de edição, remove a classe 'hidden' para mostrar.
                label.classList.remove('hidden');
                inputGroup.classList.remove('hidden');
            } else {
                // Se NÃO estiver no modo de edição, adiciona a classe 'hidden' para esconder.
                label.classList.add('hidden');
                inputGroup.classList.add('hidden');
            }
        }

        /**
         * Configura os listeners de evento para os controles de alergia.
         */
        const setupAllergyToggle = (radioYes, radioNo, inputContainer, tagsContainer) => {
            const allergyBox = inputContainer.closest('.allergy-module-box');
            const allergyInputWrapper = document.getElementById('allergy-input-wrapper');
            const allergyInputField = document.getElementById('form-allergies');
            const moduleCard = radioYes.closest('#module-diagnostico');

            const updateAllergyUI = (isYesChecked) => {
                if (isYesChecked) {
                    inputContainer.classList.remove('hidden');
                    allergyBox.classList.add('is-active');
                    updateAllergyTitleVisibility(); // Atualiza o título ao marcar "Sim"
                    updateAllergyPlaceholder();
                } else {
                    inputContainer.classList.add('hidden');
                    allergyInputWrapper.classList.add('hidden');
                    allergyBox.classList.remove('is-active');
                    exitEditMode(moduleCard);
                    updateAllergyTitleVisibility(); // Atualiza o título ao marcar "Não"
                    updateAllergyPlaceholder();
                }
            };

            radioYes.addEventListener('change', () => {
                updateAllergyUI(true); // Mantém a lógica de exibição principal

                // Pega as referências dos elementos que precisamos manipular
                const allergyInputWrapper = document.getElementById('allergy-input-wrapper');
                const allergyInputField = document.getElementById('form-allergies');
                const moduleCard = radioYes.closest('#module-diagnostico');

                // Garante que os elementos existem antes de tentar manipulá-los
                if (allergyInputWrapper && allergyInputField && moduleCard) {
                    // Entra no modo de edição do card
                    enterEditMode(moduleCard);
                    // Remove a classe 'hidden' do contêiner do input para torná-lo visível
                    allergyInputWrapper.classList.remove('hidden');
                    // Foca automaticamente no campo de texto
                    allergyInputField.focus();
                }

                setUnsavedChanges(true);
            });

            radioNo.addEventListener('change', () => {
                if (tagsContainer.children.length > 0) {
                    document.getElementById('clear-allergies-confirm-modal').classList.remove('hidden');
                } else {
                    updateAllergyUI(false);
                    setUnsavedChanges(true);
                    updateAllergyPlaceholder();
                }
            });

            if (allergyBox) {
                allergyBox.addEventListener('click', (e) => {
                    if (radioYes.checked && !e.target.closest('.remove-item-btn')) {
                        enterEditMode(moduleCard);
                        allergyInputWrapper.classList.remove('hidden');
                        allergyInputField.focus();
                        updateAllergyTitleVisibility(); // Garante que o título apareça ao entrar em edição
                        updateAllergyPlaceholder();
                    }
                });
            }
        };

        /**
         * Gera um HTML condensado e limpo de um handover para impressão.
         * @param {object} handover - O objeto de handover do Firestore.
         * @returns {string} - Uma string HTML formatada para impressão.
         */
        function generateCondensedHandoverHtml(handover) {
            if (!handover) return '<p>Dados do plantão não disponíveis.</p>';

            const formatDate = (timestamp) => {
                if (!timestamp) return 'N/A';
                const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            };
            
            const renderPrintSection = (title, content) => {
                if (!content || (typeof content === 'string' && content.trim() === '')) return '';
                return `
                    <div style="margin-bottom: 12px; page-break-inside: avoid;">
                        <h4 style="font-size: 14px; font-weight: 700; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 6px;">${title}</h4>
                        <div style="font-size: 12px; line-height: 1.4;">${content}</div>
                    </div>
                `;
            };

            let html = '';

            // Seção: Diagnóstico e Evolução
            let diagHtml = '';
            if (handover.diagnoses?.length > 0) diagHtml += `<p><strong>Diagnósticos:</strong> ${handover.diagnoses.join(', ')}</p>`;
            if (handover.comorbidities?.length > 0) diagHtml += `<p><strong>Comorbidades:</strong> ${handover.comorbidities.join(', ')}</p>`;
            if (handover.allergies?.length > 0) diagHtml += `<p><strong>Alergias:</strong> ${handover.allergies.join(', ')}</p>`;
            if (handover.evolution) diagHtml += `<div style="margin-top: 5px;"><strong>Evolução/Plano:</strong><p style="white-space: pre-wrap; margin-left: 5px;">${handover.evolution}</p></div>`;
            html += renderPrintSection('Diagnóstico e Evolução', diagHtml);

            // Seção: Segurança do Paciente
            let securityHtml = '';
            if (handover.risks && Object.values(handover.risks).some(v => v?.length > 0)) {
                const riskItems = Object.entries(handover.risks).filter(([_, v]) => v?.length > 0).map(([k, v]) => `<strong>Risco de ${k}:</strong> ${v.join(', ')}`).join('<br>');
                securityHtml += `<p><strong>Riscos:</strong><br>${riskItems}</p>`;
            }
            if (handover.precautions?.length > 0) securityHtml += `<p style="margin-top: 5px;"><strong>Precauções:</strong> ${handover.precautions.join(', ')}</p>`;
            if (handover.devices?.length > 0) securityHtml += `<p style="margin-top: 5px;"><strong>Dispositivos:</strong> ${handover.devices.join(', ')}</p>`;
            html += renderPrintSection('Segurança do Paciente', securityHtml);

            // Seção: Cuidados de Enfermagem
            if (handover.nursingCare) {
                const careItems = Object.entries(handover.nursingCare).filter(([_, v]) => v?.length > 0).map(([k, v]) => `<li><strong>${k.charAt(0).toUpperCase() + k.slice(1)}:</strong> ${v.join(', ')}</li>`).join('');
                html += renderPrintSection('Cuidados de Enfermagem', `<ul>${careItems}</ul>`);
            }

            // Seção: Monitoramento e Scores
            let monitoringHtml = '';
            if (handover.news2) monitoringHtml += `<strong>NEWS:</strong> ${handover.news2.score} (${handover.news2.level}) `;
            if (handover.fugulin) monitoringHtml += `<strong>Fugulin:</strong> ${handover.fugulin.score} (${handover.fugulin.classification})`;
            if (handover.monitoring) {
                const vitals = Object.entries(handover.monitoring).filter(([k,v]) => v && k !== 'others').map(([k,v]) => `<strong>${k.toUpperCase()}:</strong> ${v}`).join(' | ');
                if (vitals) monitoringHtml += `<p style="margin-top: 5px;"><strong>Sinais Vitais:</strong> ${vitals}</p>`;
                if (handover.monitoring.others) monitoringHtml += `<p style="margin-top: 5px;"><strong>Outros:</strong> ${handover.monitoring.others}</p>`;
            }
            html += renderPrintSection('Monitoramento e Scores', monitoringHtml);

            // Seção: Medicações Administradas
            if (handover.medicationsAdministered?.length > 0) {
                const medsList = handover.medicationsAdministered.map(m => {
                    const time = m.time.toDate ? m.time.toDate() : new Date(m.time);
                    const formattedTime = time.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                    return `<li>✓ <strong>${m.name} ${formatDose(m.dose)}</strong> às ${formattedTime}</li>`;
                }).join('');
                html += renderPrintSection('Medicações Administradas no Plantão', `<ul>${medsList}</ul>`);
            }
            
            // Seção: Alterações de Prescrição
            const medChanges = handover.changes?.medications;
            if (medChanges && (medChanges.added?.length > 0 || medChanges.suspended?.length > 0 || medChanges.modified?.length > 0)) {
                let log = '<ul>';
                 if (medChanges.added?.length > 0) {
                    log += medChanges.added.map(m => `<li><span style="color: #2563eb;">+</span> Iniciado ${formatPrescriptionForHistory(m)}</li>`).join('');
                }
                if (medChanges.suspended?.length > 0) {
                    log += medChanges.suspended.map(m => `<li><span style="color: #dc2626;">❌</span> Suspenso ${formatPrescriptionForHistory(m)}</li>`).join('');
                }
                if (medChanges.modified?.length > 0) {
                    log += medChanges.modified.map(m => `<li><span style="color: #d97706;">🔄</span> Modificado ${formatPrescriptionForHistory(m)}</li>`).join('');
                }
                log += '</ul>';
                html += renderPrintSection('Alterações de Prescrição', log);
            }
            
            // Seção: Exames
            let examsHtml = '';
            if (handover.examsDone?.length > 0) examsHtml += `<div><strong>Resultados no Plantão:</strong><ul>${handover.examsDone.map(e => `<li><strong>${e.name}:</strong> ${e.result || 'N/A'} (em ${formatDate(e.timestamp)})</li>`).join('')}</ul></div>`;
            if (handover.scheduledExams?.length > 0) examsHtml += `<div style="margin-top:5px;"><strong>Deixou Agendado:</strong><ul>${handover.scheduledExams.map(e => `<li><strong>${e.name}</strong> (para ${formatDate(e.timestamp)})</li>`).join('')}</ul></div>`;
            if (handover.pendingExams?.length > 0) examsHtml += `<div style="margin-top:5px;"><strong>Deixou Pendente:</strong><ul>${handover.pendingExams.map(e => `<li><strong>${e.name}</strong> (realizado ${formatDate(e.timestamp)})</li>`).join('')}</ul></div>`;
            html += renderPrintSection('Exames e Procedimentos', examsHtml);

            // Seção: Observações e Adendos
            let obsHtml = '';
            if(handover.pendingObs) obsHtml += `<p><strong>Observações/Pendências:</strong> ${handover.pendingObs}</p>`;
            if (handover.adendos?.length > 0) {
                obsHtml += `<div style="margin-top:8px; border-top: 1px dashed #ddd; padding-top: 8px;"><strong>Adendos:</strong><ul>${handover.adendos.map(a => `<li>- "${a.text}" <span style="font-size:10px; color:#555;">(Por ${a.professionalName} em ${formatDate(a.timestamp)})</span></li>`).join('')}</ul></div>`;
            }
            html += renderPrintSection('Observações, Pendências e Adendos', obsHtml);
            
            return html;
        }
        

        
        
        /**
         * Configura todas as interações e validações para o módulo de monitoramento.
        */
        function setupMonitoringModuleInteractions() {
            const module = document.getElementById('module-monitoramento');
            if (!module) return;

            // --- INÍCIO DA ALTERAÇÃO ---

            // Função auxiliar para ativar a edição de um input específico
            const activateMonitoringInput = (input) => {
                if (!input) return;
                const area = input.closest('.clickable-item-area');
                if (!area) return;

                const display = area.querySelector('.monitoring-display-area');
                
                if (display) display.classList.add('hidden');
                input.classList.remove('hidden');
                input.focus();
                input.select(); // Seleciona o texto para fácil edição
                input.dataset.originalValue = input.value;
            };

            // --- FIM DA ALTERAÇÃO ---

            // 1. LÓGICA DE CLIQUE PARA ABRIR A EDIÇÃO (permanece a mesma)
            module.addEventListener('click', (e) => {
                const targetArea = e.target.closest('.clickable-item-area[data-monitoring-item]');
                if (!targetArea) return;

                const input = targetArea.querySelector('.monitoring-input');
                
                // --- ALTERAÇÃO: Usa a função auxiliar ---
                if (input && input.classList.contains('hidden')) {
                    activateMonitoringInput(input);
                }
            });

            // 2. LÓGICA PARA FINALIZAR A EDIÇÃO (AO SAIR DO CAMPO OU TECLAR ENTER/TAB)
            const finishEdit = (input) => {
                const targetArea = input.closest('.clickable-item-area');
                const display = targetArea.querySelector('.monitoring-display-area');

                display.textContent = input.value;
                input.classList.add('hidden');
                display.classList.remove('hidden');

                if (input.value !== (input.dataset.originalValue || '')) {
                    setUnsavedChanges(true);
                    updateLiveScores();
                }
            };

            module.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('monitoring-input')) {
                    finishEdit(e.target);
                }
            });

            module.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.classList.contains('monitoring-input')) {
                    e.preventDefault();
                    finishEdit(e.target);
                }

                // --- INÍCIO DA ALTERAÇÃO ---
                if (e.key === 'Tab') {
                    e.preventDefault(); // Impede o comportamento padrão de pular para o próximo elemento da página

                    const allInputs = Array.from(module.querySelectorAll('.monitoring-input'));
                    const currentIndex = allInputs.findIndex(input => input === e.target);

                    if (currentIndex > -1) {
                        // Finaliza a edição do input atual
                        finishEdit(e.target);

                        // Calcula o índice do próximo input, voltando ao início se for o último
                        const nextIndex = (currentIndex + 1) % allInputs.length;
                        const nextInput = allInputs[nextIndex];

                        // Ativa a edição no próximo input
                        activateMonitoringInput(nextInput);
                    }
                }
                // --- FIM DA ALTERAÇÃO ---
            });

            // 3. LÓGICA DE VALIDAÇÃO DE ENTRADA DE DADOS (permanece a mesma)
            const validationRules = {
                numeric: /[^0-9]/g,
                pressure: /[^0-9\/]/g,
                decimal: /[^0-9.,]/g,
                text: /a^/ 
            };

            module.addEventListener('input', (e) => {
                const input = e.target;
                const validationType = input.dataset.validate;
                if (validationType && validationRules[validationType]) {
                    input.value = input.value.replace(validationRules[validationType], '');
                }
            });
        }

        /**
        * Reseta parcialmente o formulário para um novo plantão, limpando apenas os campos
        * que são específicos de um único turno (evolução, medicações, monitoramento, etc.).
        */
        function partiallyResetFormForNewShift() {
            // 1. Limpa os campos de texto principais
            const evolutionTextarea = document.getElementById('form-evolution');
            const pendingObsTextarea = document.getElementById('form-pending-obs');
            if (evolutionTextarea) evolutionTextarea.value = '';
            if (pendingObsTextarea) pendingObsTextarea.value = '';

            // 2. Limpa APENAS os medicamentos administrados no turno
            administeredInShift = [];
            
            // 3. Limpa os exames concluídos no turno
            currentShiftCompletedExams = [];
            currentShiftRescheduledExams = [];

            // 4. Limpa o módulo de Monitoramento
            populateMonitoringModule(null);
            
            // 5. Re-renderiza as listas para refletir a limpeza
            renderMedicationLists();
            renderExams();
            
            // 6. Limpa a memória de monitoramento do estado de comparação
            if (originalPatientState && originalPatientState.monitoring) {
                originalPatientState.monitoring = {};
            }
            
            // 7. Reseta o estado de "alterações não salvas"
            setUnsavedChanges(false);

            // 8. Garante que os editores estejam fechados
            resetAndCloseExamEditor();
            resetAndCloseMedicationEditor();
        }

        /**
         * Percorre a lista estática de dispositivos e adiciona um tooltip (atributo 'title') 
         * em cada um com base no mapeamento 'deviceTooltips'.
         */
        function setupDeviceTooltips() {
            const deviceCheckboxes = document.querySelectorAll('#dispositivos-grid input[type="checkbox"]');
            
            deviceCheckboxes.forEach(checkbox => {
                const abbreviation = checkbox.value;
                const fullName = deviceTooltips[abbreviation];
                
                // O <span> com o texto é o próximo elemento irmão do checkbox
                const spanElement = checkbox.nextElementSibling;

                if (spanElement && fullName) {
                    spanElement.title = fullName;
                }
            });
        }

        // Botão "Voltar" (ou "Cancelar") dentro do modal: apenas fecha o modal.
        cancelCancelExamButton.addEventListener('click', () => {
            cancelExamConfirmModal.classList.add('hidden');
            clearHistoryState();
        });

        // Botão "Sim, Cancelar" dentro do modal: executa a lógica de cancelamento.
        confirmCancelExamButton.addEventListener('click', () => {
            const examIdToCancel = confirmCancelExamButton.dataset.examId;

            if (examIdToCancel) {
                patientExams = patientExams.filter(e => e.id !== examIdToCancel);
                renderExams();
                setUnsavedChanges(true);
                showToast('Exame cancelado.', 'success'); // Adiciona feedback para o usuário
            }

            // Esconde o modal e limpa o ID guardado
            cancelExamConfirmModal.classList.add('hidden');
            delete confirmCancelExamButton.dataset.examId;
        });

        // --- Listeners para o Novo Modal de Confirmação de Alergias ---

        // Seleciona os elementos do novo modal
        const clearAllergiesModal = document.getElementById('clear-allergies-confirm-modal');
        const confirmClearAllergiesBtn = document.getElementById('confirm-clear-allergies-button');
        const cancelClearAllergiesBtn = document.getElementById('cancel-clear-allergies-button');

        // Ação do botão "Cancelar" ou "Voltar"
        cancelClearAllergiesBtn.addEventListener('click', () => {
            // Esconde o modal
            clearAllergiesModal.classList.add('hidden');

            // Desfaz a ação: como o usuário cancelou, o radio "Não" é desmarcado e o "Sim" é remarcado.
            const radioNo = document.getElementById('allergy-radio-no');
            const radioYes = document.getElementById('allergy-radio-yes');
            if (radioNo) radioNo.checked = false;
            if (radioYes) radioYes.checked = true;
            clearHistoryState();
        });

        // Ação do botão "Sim, Remover"
        confirmClearAllergiesBtn.addEventListener('click', () => {
            const tagsContainer = document.getElementById('allergies-tags-container');
            const allergyInputContainer = document.getElementById('allergy-input-container');
            const allergyBox = allergyInputContainer.closest('.allergy-module-box');
            const moduleCard = allergyBox.closest('#module-diagnostico');

            // Limpa as tags
            if (tagsContainer) tagsContainer.innerHTML = '';

            // Esconde a área de input de alergias
            if (allergyInputContainer) allergyInputContainer.classList.add('hidden');
            if (allergyBox) allergyBox.classList.remove('is-active');
            if (moduleCard) exitEditMode(moduleCard);
            updateAllergyTitleVisibility();

            // Marca que há alterações e atualiza o resumo
            setUnsavedChanges(true);
            updateDiagnosisSummary();

            // Fecha o modal de confirmação
            clearAllergiesModal.classList.add('hidden');
        });

        // --- INICIALIZAÇÃO DA APLICAÇÃO ---
        function main() {
            
        // LÓGICA DO POPUP DE CONFIRMAÇÃO

        const aiPopup = document.getElementById('ai-confirmation-popup');
        const cancelPopupButton = document.getElementById('cancel-ai-popup');
        const confirmPopupButton = document.getElementById('confirm-ai-popup');

        function openConfirmationPopup(data) {
            const form = document.getElementById('ai-confirmation-form');
            const noDataMessage = document.getElementById('ai-popup-no-data');
            const confirmButton = document.getElementById('confirm-ai-popup');

            // A função auxiliar agora é definida no início, antes de qualquer chamada.
            const createRecommendationCard = (rec) => `
                <div class="recommendation-card">
                    <p class="recommendation-header">${rec.categoria}</p>
                    <p class="recommendation-body">
                        Altere para: <strong>"${rec.recomendacao}"</strong>
                    </p>
                </div>
            `;
            
            // Função auxiliar para verificar, preencher e exibir um campo
            const setupField = (fieldName, dataValue) => {
                const container = document.getElementById(`popup-${fieldName}-container`);
                const input = document.getElementById(`popup-${fieldName}`);

                // Apenas o input é estritamente necessário para guardar o valor
                if (!input) {
                    return false;
                }

                // Verifica se o valor recebido é útil (não nulo ou vazio)
                if (dataValue && String(dataValue).trim() !== '') {
                    input.value = String(dataValue).trim();

                    // Se existe um container para este campo, garante que ele esteja visível
                    if (container) {
                        container.classList.remove('hidden');
                    }
                    return true; // Sinaliza que encontrou e preencheu conteúdo
                }

                // Se não há valor, garante que o container (se existir) fique escondido
                if (container) {
                    container.classList.add('hidden');
                }
                return false; // Sinaliza que não há conteúdo
            };

            // Verifica se os dados são nulos ou se o objeto está vazio (sem chaves próprias)
            if (!data || Object.keys(data).length === 0) {
                form.classList.add('hidden'); // Esconde o formulário
                noDataMessage.classList.remove('hidden'); // Mostra a mensagem de erro
                confirmButton.disabled = true; // Desabilita o botão de confirmar
            } else {
                form.classList.remove('hidden'); // Mostra o formulário
                noDataMessage.classList.add('hidden'); // Esconde a mensagem de erro
                confirmButton.disabled = false; // Habilita o botão de confirmar
            }

            form.reset();
            document.querySelectorAll('.popup-module-card').forEach(card => card.classList.add('hidden'));

            // Módulo: Diagnóstico e Observações
            const diagnosticoModule = document.getElementById('popup-module-diagnostico');
            if (diagnosticoModule) {
                let hasContent = false; // Começa presumindo que não há conteúdo

                // Verifica cada campo. O '||' garante que se 'hasContent' se tornar true uma vez, ele permanecerá true.
                hasContent = setupField('diagnostico', data.diagnostico) || hasContent;
                hasContent = setupField('comorbidades', data.comorbidades) || hasContent;
                hasContent = setupField('alergias', data.alergias) || hasContent;
                hasContent = setupField('observacoes', data.observacoes) || hasContent;

                // Se qualquer um dos campos acima tiver conteúdo, a flag 'hasContent' será true.
                if (hasContent) {
                    diagnosticoModule.classList.remove('hidden'); // Mostra o módulo
                } else {
                    diagnosticoModule.classList.add('hidden'); // Garante que ele fique oculto se estiver vazio
                }
            }

            // Módulo: Sinais Vitais e Monitoramento
            if (data.sinaisVitais || data.usoO2 || data.outrosMonitoramento) {
                const module = document.getElementById('popup-module-sv');
                module.classList.remove('hidden');
                if (data.sinaisVitais) {
                    // CORREÇÃO: Aceita tanto 'pa' quanto 'pressaoArterial' como chave para Pressão Arterial.
                    if (data.sinaisVitais.pa || data.sinaisVitais.pressaoArterial) {
                        module.querySelector('#popup-pa').value = data.sinaisVitais.pa || data.sinaisVitais.pressaoArterial;
                    }
                    if (data.sinaisVitais.fc) module.querySelector('#popup-fc').value = data.sinaisVitais.fc;
                    if (data.sinaisVitais.fr) module.querySelector('#popup-fr').value = data.sinaisVitais.fr;
                    if (data.sinaisVitais.temp) module.querySelector('#popup-temp').value = data.sinaisVitais.temp;
                    if (data.sinaisVitais.sat) module.querySelector('#popup-sat').value = data.sinaisVitais.sat;
                    if (data.sinaisVitais.glicemia) module.querySelector('#popup-glicemia').value = data.sinaisVitais.glicemia;
                }
                if (data.outrosMonitoramento) module.querySelector('#popup-outros-monitoramento').value = data.outrosMonitoramento;
                if (data.usoO2) module.querySelector('#popup-uso-o2').checked = true;
            }

            // Módulo: Dispositivos
            if (data.dispositivos && data.dispositivos.length > 0) {
                const module = document.getElementById('popup-module-dispositivos');
                const container = document.getElementById('popup-devices-list');
                module.classList.remove('hidden');
                container.innerHTML = '';

                data.dispositivos.forEach((device, index) => {
                    const inputId = `popup-device-input-${index}`;
                    let suggestionHtml = '';
                    if (device.suggestion) {
                        suggestionHtml = `
                            <button type="button" class="device-suggestion-button" data-target-input="${inputId}" data-suggestion="${device.suggestion}">
                                Usar "${device.suggestion}"?
                            </button>
                        `;
                    }
                    const itemHtml = `
                        <div class="device-suggestion-wrapper">
                            <input type="text" id="${inputId}" value="${device.transcribed || ''}" class="w-full text-sm">
                            ${suggestionHtml}
                        </div>
                    `;
                    container.innerHTML += itemHtml;
                });
            }
            
            // Módulo: Medicações
            
            // Módulo: Exames
            if (data.exames && data.exames.length > 0) {
                const module = document.getElementById('popup-module-exames');
                module.classList.remove('hidden');
                const examsContainer = module.querySelector('#popup-exames-list');
                examsContainer.innerHTML = '';
                const now = new Date();
                data.exames.forEach(exam => {
                    const localDateTime = exam.dataHora ? exam.dataHora.replace(' ', 'T') : '';
                    const examDate = exam.dataHora ? new Date(exam.dataHora.replace(' ', 'T')) : now;

                    const resultInputHtml = examDate <= now 
                        ? `<input type="text" data-type="exam-result" value="${exam.resultado || ''}" class="w-full text-sm" placeholder="Resultado (se houver)">`
                        : `<input type="text" data-type="exam-result" value="" class="w-full text-sm bg-gray-100" placeholder="Agendado" disabled>`;

                    const itemHtml = `<div class="p-2 border rounded-md bg-gray-50 space-y-2"><input type="text" data-type="exam-name" value="${exam.descricao || ''}" class="w-full text-sm font-semibold" placeholder="Nome do exame"><div class="grid grid-cols-2 gap-2"><input type="datetime-local" data-type="exam-datetime" value="${localDateTime}" class="w-full text-sm">${resultInputHtml}</div></div>`;
                    examsContainer.innerHTML += itemHtml;
                });
            }

            // Módulo: Recomendações de Riscos
            if (data.sugestoesRiscos && data.sugestoesRiscos.length > 0) {
                const module = document.getElementById('popup-module-riscos');
                const container = document.getElementById('popup-risks-recommendations');
                module.classList.remove('hidden');
                container.innerHTML = data.sugestoesRiscos.map(createRecommendationCard).join('');
            }

            // Módulo: Recomendações de Cuidados
            if (data.sugestoesCuidados && data.sugestoesCuidados.length > 0) {
                const module = document.getElementById('popup-module-cuidados-sugestoes');
                const container = document.getElementById('popup-care-recommendations');
                module.classList.remove('hidden');
                container.innerHTML = data.sugestoesCuidados.map(createRecommendationCard).join('');
            }
            
            aiPopup.classList.remove('hidden');
            aiPopup.classList.add('flex');
        }

        /**
        * Fecha o popup de confirmação.
        */
        function closeConfirmationPopup() {
            aiPopup.classList.add('hidden');
            aiPopup.classList.remove('flex');
        }

        // Adiciona eventos de clique aos botões do popup
        cancelPopupButton.addEventListener('click', closeConfirmationPopup);
        // Adiciona o evento de clique ao botão de confirmação
        confirmPopupButton.addEventListener('click', () => {
            // 1. Coleta os dados editados pelo usuário no popup
            const devicesString = Array.from(document.querySelectorAll('#popup-devices-list input[type="text"]'))
                .map(input => input.value.trim())
                .filter(value => value) // Remove valores vazios
                .join(', ');
            const dataFromPopup = {
                diagnostico: document.getElementById('popup-diagnostico').value,
                comorbidades: document.getElementById('popup-comorbidades').value,
                alergias: document.getElementById('popup-alergias').value,
                observacoes: document.getElementById('popup-observacoes').value,
                sinaisVitais: {
                    pa: document.getElementById('popup-pa').value,
                    fc: document.getElementById('popup-fc').value,
                    fr: document.getElementById('popup-fr').value,
                    temp: document.getElementById('popup-temp').value,
                    sat: document.getElementById('popup-sat').value,
                    glicemia: document.getElementById('popup-glicemia').value
                },
                usoO2: document.getElementById('popup-uso-o2').checked,
                outrosMonitoramento: document.getElementById('popup-outros-monitoramento').value,
                dispositivos: devicesString,
                medicamentos: Array.from(document.querySelectorAll('#popup-medicamentos-list > div')).map(div => ({
                    nome: div.querySelector('[data-type="med-name"]').value,
                    horario: div.querySelector('[data-type="med-time"]').value
                })),
                exames: Array.from(document.querySelectorAll('#popup-exames-list > div')).map(div => ({
                    nome: div.querySelector('[data-type="exam-name"]').value,
                    dataHora: (div.querySelector('[data-type="exam-datetime"]').value || '').replace('T', ' '),
                    resultado: div.querySelector('[data-type="exam-result"]').value
                })),
            };

            // 2. Chama a função para preencher o formulário principal COM os dados
            autofillMainForm(dataFromPopup);
            
            // 3. Fecha o popup
            closeConfirmationPopup();
        });

        // Listener para controlar a navegação entre páginas do navegador
        window.addEventListener('popstate', (event) => {
            const state = event.state;
            const hash = window.location.hash;

            // Se o usuário clicar em "voltar" e houver alterações não salvas na tela de detalhes, pergunta antes de sair.
            if (currentScreen === 'patientDetail' && hasUnsavedChanges) {
                if (!confirm('Você tem alterações não salvas. Deseja sair mesmo assim?')) {
                    // Se o usuário cancelar, empurra o estado de volta para o histórico para "cancelar" a ação de voltar.
                    history.pushState({ screen: 'patientDetail', patientId: currentPatientId }, `Paciente ${currentPatientId}`, `#paciente/${currentPatientId}`);
                    return;
                }
                hasUnsavedChanges = false;
            }

            // Fecha TODOS os modais abertos, garantindo uma navegação limpa.
            document.querySelectorAll('.fixed.inset-0.z-50:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });

            // Lógica de navegação baseada no estado ou na URL
            if (state?.screen === 'patientDetail' && state.patientId) {
                renderPatientDetail(state.patientId); // Renderiza a tela do paciente
            } else if (hash.startsWith('#paciente/')) {
                const patientId = hash.substring('#paciente/'.length);
                if (patientId) {
                    renderPatientDetail(patientId);
                } else {
                    showScreen('main');
                }
            } else {
                // Se não for uma tela de paciente, volta para o painel principal.
                showScreen('main');
            }
        });

        const mainContentArea = document.querySelector('#main-content > main');
            if (mainContentArea) {
                mainContentArea.addEventListener('scroll', () => {
                    // Se uma lista de autocomplete estiver ativa
                    if (activeAutocomplete && activeAutocomplete.listElement) {
                        // Reposiciona a lista para acompanhar a rolagem
                        positionFloatingList(activeAutocomplete.inputElement, activeAutocomplete.listElement);
                    }
                });
            }

        // Listener para abrir/fechar o painel de notificações
        notificationBellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationPanel.classList.toggle('hidden');
        });

        // Listener para cliques nos itens da lista de notificação
        notificationList.addEventListener('click', (e) => {
            const item = e.target.closest('.notification-item');
            if (item) {
                const { notifId, patientId, handoverId } = item.dataset;
                handleNotificationClick(notifId, patientId, handoverId);
            }
        });

        document.getElementById('add-new-medication-btn').addEventListener('click', () => {
            resetAndCloseMedicationEditor(); // Garante que o editor esteja limpo
            medEditor.mode.value = 'new';
            medEditor.title.textContent = 'Adicionar Nova Medicação';
            medMainActionArea.classList.add('hidden');
            medEditorArea.classList.remove('hidden');
            medSteps.step1.classList.remove('hidden');
            medEditor.name.focus();
        });

        medEditorCloseBtn.addEventListener('click', resetAndCloseMedicationEditor);

        // Navegação para frente no editor
        medEditor.name.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (medEditor.name.value.trim() && medEditor.dose.value.trim()) {
                    showMedicationEditorStep('step2');
                } else {
                    medEditor.dose.focus();
                }
            }
        });
        medEditor.dose.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (medEditor.name.value.trim() && medEditor.dose.value.trim()) {
                    showMedicationEditorStep('step2');
                }
            }
        });

        // Seleção de tipo de medicação
        medEditorArea.addEventListener('click', (e) => {
            const typeBtn = e.target.closest('.med-type-btn');
            if (typeBtn) {
                const type = typeBtn.dataset.type;
                if (type === 'single') {
                    showMedicationEditorStep('step3a');
                } else { // continuous
                    showMedicationEditorStep('step3b');
                    flatpickr("#med-editor-start-time", configAgendamento);
                }
            }

            const actionBtn = e.target.closest('.med-single-action-btn');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                medEditor.mode.value = action; // 'schedule' or 'register'
                showMedicationEditorStep('step4');
                const config = action === 'schedule' ? configAgendamento : configRegistro;
                medEditor.datetimeLabel.textContent = action === 'schedule' ? 'Agendar Para' : 'Registrado Em';
                flatpickr("#med-editor-datetime-input", config);
            }
        });

        // Botão de voltar do editor
        medEditor.backBtn.addEventListener('click', () => {
            // Lógica simples para voltar um passo (pode ser aprimorada se necessário)
            if (!medSteps.step4.classList.contains('hidden')) {
                showMedicationEditorStep('step3a'); // Volta para a escolha de ação
            } else if (!medSteps.step3a.classList.contains('hidden') || !medSteps.step3b.classList.contains('hidden')) {
                showMedicationEditorStep('step2');
            } else if (!medSteps.step2.classList.contains('hidden')) {
                showMedicationEditorStep('step1');
            }
        });

        // Botão de salvar
        medEditor.saveBtn.addEventListener('click', () => {
            const name = medEditor.name.value.trim();
            const dose = medEditor.dose.value.trim();
            const prescriptionId = medEditor.id.value;
            const isEditing = medEditor.mode.value === 'edit';

            if (!name || !dose) {
                showToast("Nome e dose da medicação são obrigatórios.", "error");
                return;
            }

            // Se estiver editando, remove a prescrição antiga para ser substituída.
            if (isEditing) {
                activePrescriptions = activePrescriptions.filter(p => p.prescriptionId !== prescriptionId);
            }

            // Lógica para Dose Única
            if (medEditor.mode.value === 'schedule' || medEditor.mode.value === 'register') {
                const date = parseBrazilianDateTime(medEditor.datetimeInput.value);
                const newPrescription = {
                    prescriptionId: isEditing ? prescriptionId : `single_${Date.now()}`,
                    type: 'single',
                    name,
                    dose,
                    time: date, // Salva como objeto Date
                };

                if (medEditor.mode.value === 'register') {
                    administeredInShift.push(newPrescription);
                } else {
                    activePrescriptions.push(newPrescription);
                }
            }
            // Lógica para Uso Contínuo (Posologia)
            else if (!medSteps.step3b.classList.contains('hidden')) {
                const startDate = parseBrazilianDateTime(medEditor.startTime.value);
                const frequency = parseInt(medEditor.frequency.value, 10);
                const duration = parseInt(medEditor.duration.value, 10);

                if (isNaN(frequency) || isNaN(duration) || frequency <= 0 || duration <= 0) {
                     showToast("Frequência e duração devem ser números válidos.", "error");
                     return;
                }

                const newPrescription = {
                    prescriptionId: isEditing ? prescriptionId : `cont_${Date.now()}`,
                    type: 'continuous',
                    name,
                    dose,
                    startTime: startDate,
                    frequency,
                    duration,
                };
                activePrescriptions.push(newPrescription);
            }

            renderMedicationLists();
            resetAndCloseMedicationEditor();
            setUnsavedChanges(true);
        });

        document.getElementById('module-medicacoes').addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.med-action-btn');
            if (!actionBtn) return;

            const listItem = actionBtn.closest('.medication-list-item');
            const doseId = listItem.dataset.doseId;
            const prescriptionId = listItem.dataset.prescriptionId;
            const action = actionBtn.dataset.action;

            if (action === 'administer') {
                openAdministerDoseEditor(doseId);
            }

            if (action === 'add-dose') {
                openAddDoseEditor(prescriptionId);
            }

            if (action === 'edit') {
                if (prescriptionId) {
                    openMedicationEditorForEdit(prescriptionId);
                }
            }

            if (action === 'delete') {
                const group = Object.values(administeredInShift.reduce((acc, dose) => {
                    if (dose.prescriptionId === prescriptionId) {
                        if (!acc[prescriptionId]) acc[prescriptionId] = { doses: [] };
                        acc[prescriptionId].doses.push(dose);
                    }
                    return acc;
                }, {}))[0];

                if (group && group.doses.length > 0) {
                    const lastDose = group.doses.sort((a, b) => b.time.getTime() - a.time.getTime())[0];
                    
                    const modal = document.getElementById('generic-confirm-modal');
                    modal.querySelector('#generic-confirm-title').textContent = 'Excluir Registro de Dose';
                    modal.querySelector('#generic-confirm-text').textContent = `Tem certeza que deseja excluir o último registro de ${lastDose.name}? Esta ação não pode ser desfeita.`;
                    modal.querySelector('#generic-confirm-button').textContent = 'Sim, Excluir';
                    
                    const confirmBtn = modal.querySelector('#generic-confirm-button');
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

                    newConfirmBtn.addEventListener('click', () => {
                        const doseIndex = administeredInShift.findIndex(d => d.id === lastDose.id);
                        if (doseIndex > -1) {
                            const [deletedDose] = administeredInShift.splice(doseIndex, 1);
                            renderMedicationLists();
                            setUnsavedChanges(true);
                            showToast(`Registro de ${deletedDose.name} removido.`, 'success');
                        }
                        modal.classList.add('hidden');
                    }, { once: true });

                    modal.querySelector('#generic-cancel-button').onclick = () => modal.classList.add('hidden');
                    modal.classList.remove('hidden');
                }
            }
        });

        // Fecha o painel se clicar em qualquer outro lugar
        window.addEventListener('click', (e) => {
            if (!notificationPanel.classList.contains('hidden') && !e.target.closest('#notification-panel') && !e.target.closest('#notification-bell-btn')) {
                notificationPanel.classList.add('hidden');
            }
        });

        setupDeviceTooltips();

        // Elementos dos modais
        const lastHandoverModal = document.getElementById('last-handover-modal');
        const fullHistoryModal = document.getElementById('full-history-modal');
        const openHistoryFromLastBtn = document.getElementById('open-full-history-from-last-handover-btn');

        // Listener para o novo botão "Visualizar Histórico"
        if(openHistoryFromLastBtn) {
            openHistoryFromLastBtn.addEventListener('click', () => {
                // Esconde o modal atual
                lastHandoverModal.classList.add('hidden');
                // Mostra o modal de histórico completo
                fullHistoryModal.classList.remove('hidden');
            });
        }

        // Botão Voltar: Do modal de DETALHES (3) para a LISTA DE HISTÓRICO (2)
        if (backToHistoryListBtn) {
            backToHistoryListBtn.addEventListener('click', () => {
                viewHandoverModal.classList.add('hidden');
                fullHistoryModal.classList.remove('hidden');
                pushHistoryState('full-history-modal');
            });
        }

        // Botão Voltar: Da LISTA DE HISTÓRICO (2) para o modal de ÚLTIMA PASSAGEM (1)
        if (backToLastHandoverBtn) {
            backToLastHandoverBtn.addEventListener('click', () => {
                // Esconde o modal de histórico completo
                fullHistoryModal.classList.add('hidden');

                // Em vez de apenas mostrar o modal antigo, chamamos a função
                // que o popula novamente. Isso reseta o estado e recarrega os dados corretos.
                populateLastHandoverModal();
                
                // A função populateLastHandoverModal já cuida de tornar o modal visível.
            });
        }
        // --- ADIÇÃO: FECHA O MODO DE EDIÇÃO DE ALERGIA AO CLICAR FORA DO INPUT ---
        const allergyInputField = document.getElementById('form-allergies');
        if (allergyInputField) {
            allergyInputField.addEventListener('focusout', (e) => {
                // Pequeno delay para permitir cliques em outros botões (como o de salvar)
                setTimeout(() => {
                    // Se o foco não foi para um elemento dentro do próprio módulo, fecha a edição
                    const moduleCard = e.target.closest('.module-editing');
                    if (moduleCard && !moduleCard.contains(document.activeElement)) {
                        e.target.parentElement.classList.add('hidden'); // Esconde o input
                        exitEditMode(moduleCard);
                    }
                }, 100);
            });
        }

            setupMonitoringModuleInteractions();

            // Garante que o botão 'X' do modal de histórico sempre funcione
            const closeModuleHistoryModalBtn = document.getElementById('close-module-history-modal');
            const moduleHistoryModal = document.getElementById('module-history-modal');

            if (closeModuleHistoryModalBtn && moduleHistoryModal) {
                closeModuleHistoryModalBtn.addEventListener('click', () => {
                    moduleHistoryModal.classList.add('hidden');
                });
            }

            // Ativa modo de edição por foco em módulos específicos
            const focusToEditModules = [
                { selector: '#module-dispositivos' },
                { selector: '#module-cuidados-enfermagem' },
                { selector: '#module-monitoramento' }, // Já que ele tem inputs
                { selector: '#module-observacoes' }   // Já que ele tem um textarea
            ];

            focusToEditModules.forEach(config => {
                const moduleElement = document.querySelector(config.selector);
                if (moduleElement) {
                    moduleElement.addEventListener('focusin', (e) => {
                        // VERIFICAÇÃO: Se o elemento que recebeu o foco (e.target)
                        // for o botão de histórico, ele não faz nada e interrompe a função.
                        if (e.target.closest('.module-history-btn')) {
                            return;
                        }

                        // Se o foco não veio do botão de histórico, entra no modo de edição normalmente.
                        enterEditMode(moduleElement);
                    });
                }
            });

            const evolutionTextarea = document.getElementById('form-evolution');
            if (evolutionTextarea) {
                evolutionTextarea.addEventListener('focus', () => {
                    const moduleCard = evolutionTextarea.closest('#module-diagnostico');
                    if (moduleCard) {
                        enterEditMode(moduleCard);
                    }
                });
            }

            const savedViewMode = localStorage.getItem('patientViewMode');
            if (savedViewMode === 'list' || savedViewMode === 'grid') {
                currentViewMode = savedViewMode;
            }
            // Aplica o modo de visualização correto ao contêiner ANTES de carregar os dados.
            if (currentViewMode === 'list') {
                // Altera o ícone do botão
                viewToggleIconGrid.classList.add('hidden');
                viewToggleIconList.classList.remove('hidden');
                // Altera as classes do contêiner da lista para o layout de lista
                patientList.className = 'mt-6 px-4 sm:px-0 flex flex-col gap-2';
            } else {
                // Garante que o layout de grade seja o padrão se não for lista
                viewToggleIconGrid.classList.remove('hidden');
                viewToggleIconList.classList.add('hidden');
                patientList.className = 'mt-6 px-4 sm:px-0 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3';
            }
            setupFormAccordion(); // Configura o acordeão do formulário

            document.getElementById('form-evolution').addEventListener('input', updateDiagnosisSummary);
    

            // Monitora o estado da autenticação do usuário
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    currentUser = user;
                    userInfo.textContent = `Olá, ${user.displayName || user.email}`;

                    loadInitialPatients();

                    const hash = window.location.hash;
                    if (hash.startsWith('#paciente/')) {
                        const patientId = hash.substring('#paciente/'.length);
                        if (patientId) {
                            // CORREÇÃO: Em vez de renderizar diretamente, chama a função principal de navegação.
                            // Ela cuidará de definir o estado do histórico e renderizar a tela.
                            showPatientDetail(patientId, null, true); // O 'true' evita criar uma nova entrada no histórico
                        } else {
                            history.replaceState({ screen: 'main' }, 'Painel de Pacientes', '#painel');
                            showScreen('main');
                        }
                    } else {
                        history.replaceState({ screen: 'main' }, 'Painel de Pacientes', '#painel');
                        showScreen('main');
                    }

                    setupNotificationListener(user);
                } else {
                    currentUser = null;
                    if (unsubscribePatients) unsubscribePatients();
                    if (unsubscribeHandovers) unsubscribeHandovers();
                    if (unsubscribeNotifications) unsubscribeNotifications();
                    history.replaceState({ screen: 'login' }, 'Login', ' ');
                    showScreen('login');
                }
                screens.loading.classList.add('hidden');
            });

            const addNewMedicationBtn = document.getElementById('add-new-medication-btn');
            const medicationSearchWrapper = document.getElementById('medication-search-wrapper');
            const medicationInput = document.getElementById('form-medications');
            const moduleMedicacoes = document.getElementById('module-medicacoes');

            if (addNewMedicationBtn) {
                addNewMedicationBtn.addEventListener('click', () => {
                    enterEditMode(moduleMedicacoes);
                    scrollToModule(moduleMedicacoes); // << LINHA ADICIONADA
                });
            }

        // Abre/Fecha o modal de resumo da unidade
        if (showUnitSummaryButton) {
            showUnitSummaryButton.addEventListener('click', showUnitSummary);
        }

        if (closeUnitSummaryModalButton && unitSummaryModal) {
            closeUnitSummaryModalButton.addEventListener('click', () => {
                unitSummaryModal.classList.add('hidden');
                clearHistoryState();
            });
        }

         if (printUnitSummaryButton) {
            printUnitSummaryButton.addEventListener('click', handlePrintUnitSummary);
        }

        // Abre/Fecha o modal de painel de medicações da unidade
        if (showUnitMedicationsButton) {
            showUnitMedicationsButton.addEventListener('click', showUnitMedicationsPanel);
        }
        if (closeUnitMedicationsModalButton && unitMedicationsModal) {
            closeUnitMedicationsModalButton.addEventListener('click', () => {
                unitMedicationsModal.classList.add('hidden');
            });
        }

        // Botões do modal de confirmação de exclusão de prescrição
        document.getElementById('med-editor-delete-btn').addEventListener('click', (e) => {
            const prescriptionId = e.currentTarget.dataset.prescriptionId;
            if (prescriptionId) {
                confirmDeletePrescriptionButton.dataset.prescriptionId = prescriptionId;
                deletePrescriptionConfirmModal.classList.remove('hidden');
            }
        });

        cancelDeletePrescriptionButton.addEventListener('click', () => {
            deletePrescriptionConfirmModal.classList.add('hidden');
        });

        confirmDeletePrescriptionButton.addEventListener('click', () => {
            const prescriptionId = confirmDeletePrescriptionButton.dataset.prescriptionId;
            if (prescriptionId) {
                // Remove todas as doses (atrasadas e futuras) da prescrição
                const prescriptionName = activePrescriptions.find(d => d.prescriptionId === prescriptionId)?.name || 'A medicação';
                activePrescriptions = activePrescriptions.filter(d => d.prescriptionId !== prescriptionId);

                renderMedicationLists();
                resetAndCloseMedicationEditor();
                setUnsavedChanges(true);
                showToast(`${prescriptionName} foi suspensa.`, 'success');
            }
            deletePrescriptionConfirmModal.classList.add('hidden');
        });

        // Listener unificado para a tecla "Enter" no body
        document.body.addEventListener('keydown', (e) => {
            // Verifica se a tecla é "Enter" e se a tecla Shift NÃO está pressionada
            if (e.key === 'Enter' && !e.shiftKey) {
                
                // --- INÍCIO DA CORREÇÃO: Lógica de proteção contra duplo 'Enter' ---
                if (e.target.id === 'form-medications') {
                    // Se o 'Enter' foi pressionado na caixa de busca de medicação,
                    // este listener do 'body' deve ignorá-lo completamente.
                    // O listener específico do campo de texto cuidará da ação.
                    return; 
                }

                // Lógica para salvar Adendo (permanece a mesma)
                if (e.target.matches('textarea[id^="adendo-text-"]')) {
                    e.preventDefault();
                    const adendoSection = e.target.closest('.adendos-container');
                    if (adendoSection) {
                        const saveBtn = adendoSection.querySelector('.save-adendo-btn');
                        saveBtn.click();
                    }
                    return;
                }

                // Lógica para salvar Horário de Medicação (permanece a mesma)
                const timeEditor = document.getElementById('medication-time-editor');
                if (timeEditor && !timeEditor.classList.contains('hidden')) {
                    e.preventDefault();
                    
                    const correctBtn = document.getElementById('correct-med-time-btn');
                    const addBtn = document.getElementById('add-med-time-btn');

                    if (correctBtn && !correctBtn.classList.contains('hidden')) {
                        correctBtn.click();
                    } else if (addBtn) {
                        addBtn.click();
                    }
                }
            }
        });

        // Listener para os botões "Adicionar Adendo" e os formulários inline
        document.body.addEventListener('click', (e) => {
            const triggerBtn = e.target.closest('.add-adendo-trigger-btn');
            const cancelBtn = e.target.closest('.cancel-adendo-btn');
            const saveBtn = e.target.closest('.save-adendo-btn');
            const toggleViewBtn = e.target.closest('.toggle-adendos-view-btn');

            if (triggerBtn) {
                const adendoSection = triggerBtn.closest('.adendos-container');
                if (adendoSection) {
                    const formWrapper = adendoSection.querySelector('.inline-adendo-form-wrapper');
                    const triggerWrapper = adendoSection.querySelector('.add-adendo-trigger-wrapper');
                    if (formWrapper && triggerWrapper) {
                        triggerWrapper.classList.add('hidden'); // Esconde o botão de adicionar
                        formWrapper.classList.remove('hidden');
                        formWrapper.querySelector('textarea').focus();
                    }
                }
            }

            if (cancelBtn) {
                const adendoSection = cancelBtn.closest('.adendos-container');
                if (adendoSection) {
                    const formWrapper = adendoSection.querySelector('.inline-adendo-form-wrapper');
                    const triggerWrapper = adendoSection.querySelector('.add-adendo-trigger-wrapper');
                    
                    if(formWrapper && triggerWrapper) {
                        formWrapper.querySelector('textarea').value = '';
                        formWrapper.classList.add('hidden');
                        // CORREÇÃO: garante que o wrapper do botão seja exibido.
                        triggerWrapper.classList.remove('hidden');
                    }
                }
            }

            if (saveBtn) {
                const adendoSection = saveBtn.closest('.adendos-container');
                const textarea = adendoSection.querySelector('textarea');
                const handoverId = currentlyViewedHandover?.id;

                if (handoverId && textarea) {
                    saveAdendo(handoverId, textarea.value, saveBtn);
                }
            }
            
            if (toggleViewBtn) {
                const adendosSection = toggleViewBtn.closest('.adendos-container');
                const currentState = toggleViewBtn.dataset.state;
                
                // Inverte o estado
                toggleViewBtn.dataset.state = (currentState === 'last') ? 'all' : 'last';
                
                // Re-renderiza a lista com o novo estado
                renderAdendosList(currentlyViewedHandover.adendos, adendosSection);
            }
        });

        // --- Listeners de Conexão do Navegador ---
        window.addEventListener('offline', () => {
            console.log("Navegador detectou offline.");
            updateConnectionStatus('offline');
        });

        window.addEventListener('online', () => {
            console.log("Navegador detectou online. Tentando sincronizar...");
            updateConnectionStatus('connecting'); 
            // O status mudará para 'online' de fato quando o onSnapshot confirmar a conexão.
        });

        }

        const monitoringModule = document.getElementById('module-monitoramento');
        if (monitoringModule) {
            const monitoringInputs = monitoringModule.querySelectorAll('.monitoring-input');
            const monitoringConfirmBtn = monitoringModule.querySelector('.confirm-edit-btn');

            // Entra no modo de edição quando qualquer input recebe foco
            monitoringInputs.forEach(input => {
                input.addEventListener('focus', () => {
                    enterEditMode(monitoringModule);
                });
            });

            // Sai do modo de edição ao clicar em 'Confirmar'
            if (monitoringConfirmBtn) {
                monitoringConfirmBtn.addEventListener('click', () => {
                    exitEditMode(monitoringModule);
                });
            }
        }

        // Listener para a tecla "Enter" no campo de diagnóstico
        diagnosisInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Previne o comportamento padrão (submeter formulário)
                const inputValue = diagnosisInput.value.trim();

                // Se houver texto no campo, usa esse texto para criar a tag
                if (inputValue) {
                    const container = document.getElementById('diagnoses-tags-container');
                    container.appendChild(createListItem(inputValue));
                    diagnosisInput.value = ''; // Limpa o campo
                    updateDiagnosisSummary();
                    setUnsavedChanges(true);
                    hideActiveAutocomplete(); // Esconde a lista de sugestões
                }
            }
        });

        // Fecha menus de opções se clicar fora
        window.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden'));
        });
        // Chama a função para aplicar as máscaras e validações
        applyInputMasksAndValidation();

        // Seleciona os elementos necessários: o botão, a área de busca e o card do módulo.
        const addNewMedicationBtn = document.getElementById('add-new-medication-btn');
        const medicationSearchWrapper = document.getElementById('medication-search-wrapper');
        // A variável 'medicationInput' já foi declarada no topo do script, então apenas a usamos aqui.
        const moduleMedicacoes = document.getElementById('module-medicacoes');

        // Garante que todos os elementos existem antes de adicionar o listener para evitar erros
        if (addNewMedicationBtn && medicationSearchWrapper && medicationInput && moduleMedicacoes) {
            
            addNewMedicationBtn.addEventListener('click', () => {
                // 1. Mostra a caixa de busca de medicação
                medicationSearchWrapper.classList.remove('hidden');
                
                // 2. Foca automaticamente no campo de input para o usuário já poder digitar
                medicationInput.focus();

                // 3. Ativa o modo de edição para o módulo de medicações, mantendo a consistência da UI
                enterEditMode(moduleMedicacoes);
            });
        }

        // Inicializa os calendários de data de nascimento nos modais
        flatpickr("#new-patient-dob", configDatePickerNascimento);
        flatpickr("#edit-patient-dob", configDatePickerNascimento);

        if (printLastHandoverButton) {
            printLastHandoverButton.addEventListener('click', () => {
                if (!currentPatientData || !currentHandovers || currentHandovers.length === 0) {
                    showToast("Não há dados para imprimir.", "error");
                    return;
                }

                const latestHandover = currentHandovers[0];
                const printView = document.getElementById('print-view');
                const handoverHtml = generateCondensedHandoverHtml(latestHandover);
                const date = latestHandover.timestamp?.toDate ? latestHandover.timestamp.toDate() : new Date();
                
                // Coleta dos dados do paciente
                const patientName = currentPatientData.name || 'N/A';
                const patientNumber = currentPatientData.patientNumber || 'N/A';
                const roomNumber = currentPatientData.roomNumber || 'N/A';
                const age = calculateAge(currentPatientData.dob);
                const admissionDate = currentPatientData.createdAt?.toDate().toLocaleDateString('pt-BR') || 'N/A';

                printView.innerHTML = `
                    <div style="padding: 1rem; font-family: 'Inter', sans-serif; color: #333;">
                        <h2 style="font-size: 1.2rem; font-weight: 700;">Última Passagem de Plantão - ${patientName}</h2>

                        <div style="font-size: 0.9rem; color: #555; margin-top: 0.25rem;">
                            <span style="margin-right: 0.75rem;"><strong>Idade:</strong> ${age} anos</span>
                            <span style="margin-right: 0.75rem;"><strong>Leito:</strong> ${roomNumber}</span>
                            <span style="margin-right: 0.75rem;"><strong>Pront.:</strong> ${patientNumber}</span>
                            <span><strong>Internação:</strong> ${admissionDate}</span>
                        </div>
                        
                        <p style="font-size: 0.8rem; color: #555; margin-top: 0.75rem; padding-bottom: 0.75rem; border-bottom: 2px solid #ccc; margin-bottom: 1rem;">
                            <strong>Profissional:</strong> ${latestHandover.professionalName || 'N/A'} | 
                            <strong>Data da Passagem:</strong> ${date.toLocaleString('pt-BR', {dateStyle: 'long', timeStyle: 'short'})}
                        </p>
                        ${handoverHtml}
                    </div>
                `;
                
                setTimeout(() => window.print(), 200);
            });
        }

        if (printHandoverDetailButton) {
            printHandoverDetailButton.addEventListener('click', () => {
                if (!currentPatientData || !currentlyViewedHandover) {
                    showToast("Não há dados de plantão para imprimir.", "error");
                    return;
                }

                const printView = document.getElementById('print-view');
                const handoverHtml = generateCondensedHandoverHtml(currentlyViewedHandover);
                const date = currentlyViewedHandover.timestamp?.toDate ? currentlyViewedHandover.timestamp.toDate() : new Date();

                // Coleta dos dados do paciente
                const patientName = currentPatientData.name || 'N/A';
                const patientNumber = currentPatientData.patientNumber || 'N/A';
                const roomNumber = currentPatientData.roomNumber || 'N/A';
                const age = calculateAge(currentPatientData.dob);
                const admissionDate = currentPatientData.createdAt?.toDate().toLocaleDateString('pt-BR') || 'N/A';

                printView.innerHTML = `
                    <div style="padding: 1rem; font-family: 'Inter', sans-serif; color: #333;">
                        <h2 style="font-size: 1.2rem; font-weight: 700;">Detalhes do Plantão - ${patientName}</h2>

                        <div style="font-size: 0.9rem; color: #555; margin-top: 0.25rem;">
                            <span style="margin-right: 0.75rem;"><strong>Idade:</strong> ${age} anos</span>
                            <span style="margin-right: 0.75rem;"><strong>Leito:</strong> ${roomNumber}</span>
                            <span style="margin-right: 0.75rem;"><strong>Pront.:</strong> ${patientNumber}</span>
                            <span><strong>Internação:</strong> ${admissionDate}</span>
                        </div>

                        <p style="font-size: 0.8rem; color: #555; margin-top: 0.75rem; padding-bottom: 0.75rem; border-bottom: 2px solid #ccc; margin-bottom: 1rem;">
                            <strong>Profissional:</strong> ${currentlyViewedHandover.professionalName || 'N/A'} | 
                            <strong>Data da Passagem:</strong> ${date.toLocaleString('pt-BR', {dateStyle: 'long', timeStyle: 'short'})}
                        </p>
                        ${handoverHtml}
                    </div>
                `;

                setTimeout(() => window.print(), 200);
            });
        }

        // Inicia a aplicação depois que todos os recursos da página foram carregados
        window.addEventListener('load', main);

        // Registra o Service Worker para funcionamento offline
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                console.log('Service Worker registrado com sucesso:', registration);
                })
                .catch(error => {
                console.error('Falha ao registrar o Service Worker:', error);
                });
            });
        }
        
        // --- FUNÇÕES DE FORMATAÇÃO DE TEXTO ---

        /**
         * Capitaliza a primeira letra de cada palavra com mais de 3 letras em uma string.
         * O restante da palavra é convertido para minúsculas para garantir consistência.
         * @param {string} text O texto a ser formatado.
         * @returns {string} O texto formatado.
         */
        function capitalizeWords(text) {
            // Retorna o valor original se não for uma string válida
            if (typeof text !== 'string' || !text) return text;

            // Divide o texto em palavras, formata cada uma e junta novamente
            return text.split(' ').map(word => {
                if (word.length > 3) {
                    // Capitaliza a primeira letra e força o resto para minúsculas
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }
                return word; // Retorna a palavra como está se tiver 3 letras ou menos
            }).join(' ');
        }

        /**
         * Percorre o objeto de dados estruturados da IA e aplica a capitalização seletivamente.
         * @param {object} data O objeto de dados retornado pelo Gemini.
         * @returns {object} O objeto de dados com os campos formatados.
         */
        function formatStructuredData(data) {
            // Lista de chaves cujos valores NÃO devem ser capitalizados
            const exemptKeys = ['observacoes', 'cuidados', 'resultado'];
            
            // Cria uma cópia do objeto para evitar modificar o original diretamente
            const formattedData = { ...data };

            for (const key in formattedData) {
                // Garante que estamos processando apenas as chaves do próprio objeto
                if (Object.prototype.hasOwnProperty.call(formattedData, key)) {
                    const value = formattedData[key];

                    if (typeof value === 'string' && !exemptKeys.includes(key)) {
                        // Se for uma string e a chave não for uma exceção, capitaliza
                        formattedData[key] = capitalizeWords(value);
                    } else if (Array.isArray(value)) {
                        // Se for um array (como medicamentos ou exames)
                        formattedData[key] = value.map(item => {
                            if (typeof item === 'object' && item !== null) {
                                // Se o item do array for um objeto (ex: um exame)
                                const formattedItem = { ...item };
                                for (const itemKey in formattedItem) {
                                    // Capitaliza as propriedades do objeto, a menos que a chave seja uma exceção (como 'resultado')
                                    if (typeof formattedItem[itemKey] === 'string' && !exemptKeys.includes(itemKey)) {
                                        formattedItem[itemKey] = capitalizeWords(formattedItem[itemKey]);
                                    }
                                }
                                return formattedItem;
                            }
                            return item; // Retorna itens que não são objetos (se houver) como estão
                        });
                    } else if (typeof value === 'object' && value !== null && key === 'sinaisVitais') {
                        // Mantém os valores de sinaisVitais como estão, pois são numéricos
                        formattedData[key] = value;
                    }
                }
            }
            return formattedData;
        }


        // PREENCHIMENTO AUTOMÁTICO DO FORMULÁRIO PRINCIPAL
        function autofillMainForm(data) {
            console.log("Iniciando preenchimento automático do formulário principal com dados:", data);

            // --- FUNÇÕES AUXILIARES ---
            const fillAndDispatch = (fieldId, value) => {
                if (!value || (typeof value === 'string' && value.trim() === '')) return;
                const element = document.getElementById(fieldId);
                if (element) {
                    const moduleCard = element.closest('.module-card');
                    if(moduleCard) enterEditMode(moduleCard);
                    element.value = value;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
            };

            const addTags = (containerId, valuesString) => {
                if (!valuesString || valuesString.trim() === '') return;
                const container = document.getElementById(containerId);
                if (container) {
                    const moduleCard = container.closest('.module-card');
                    if (moduleCard) enterEditMode(moduleCard);
                    // Não limpa o container, apenas adiciona
                    valuesString.split(',').forEach(value => {
                        const trimmedValue = value.trim();
                        if (trimmedValue) container.appendChild(createListItem(trimmedValue));
                    });
                }
            };
            
            // --- PREENCHIMENTO DOS MÓDULOS ---

            // Diagnóstico, Comorbidades, Alergias e Precauções
            addTags('diagnoses-tags-container', data.diagnostico);
            addTags('comorbidities-tags-container', data.comorbidades);
            addTags('precaucoes-container', data.precaucoes);
            if (data.alergias && data.alergias.trim() !== '') {
                document.getElementById('allergy-radio-yes').click();
                addTags('allergies-tags-container', data.alergias);
            }

            // Monitoramento e Sinais Vitais
            if (data.sinaisVitais || data.usoO2 || data.outrosMonitoramento) {
                const svModule = document.getElementById('module-monitoramento');
                if (svModule) enterEditMode(svModule);

                // Função auxiliar para preencher um campo de monitoramento (input e display)
                const fillMonitoringField = (inputId, value) => {
                    if (!value || String(value).trim() === '') return;
                    const inputElement = document.getElementById(inputId);
                    if (inputElement) {
                        const displayArea = inputElement.closest('.clickable-item-area')?.querySelector('.monitoring-display-area');
                        inputElement.value = value;
                        if (displayArea) {
                            displayArea.textContent = value;
                        }
                        // Dispara eventos para que outras partes do código (como o cálculo de scores) sejam notificadas da mudança
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                };

                // Preenche os campos de sinais vitais com os dados recebidos
                if (data.sinaisVitais) {
                    fillMonitoringField('form-sv-pa', data.sinaisVitais.pa);
                    fillMonitoringField('form-sv-fc', data.sinaisVitais.fc);
                    fillMonitoringField('form-sv-fr', data.sinaisVitais.fr);
                    fillMonitoringField('form-sv-temp', data.sinaisVitais.temp);
                    fillMonitoringField('form-sv-sato2', data.sinaisVitais.sat); // A API retorna 'sat', o campo é 'sato2'
                    fillMonitoringField('form-sv-hgt', data.sinaisVitais.glicemia); // A API retorna 'glicemia', o campo é 'hgt'
                }
                
                // Preenche outros campos de monitoramento
                if (data.outrosMonitoramento) {
                    fillMonitoringField('form-sv-others', data.outrosMonitoramento);
                }
                
                // Marca o uso de O2 se informado
                if (data.usoO2) {
                    const o2Checkbox = document.getElementById('form-sv-o2');
                    if(o2Checkbox) {
                        o2Checkbox.checked = true;
                        o2Checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
            
            // Dispositivos
            if (data.dispositivos) {
                const moduleCard = document.getElementById('module-dispositivos');
                if (moduleCard) enterEditMode(moduleCard);
                data.dispositivos.split(',').forEach(deviceStr => {
                    const deviceName = deviceStr.trim();
                    if (!deviceName) return;
                    const existingCheckbox = Array.from(document.querySelectorAll('#dispositivos-grid input[type="checkbox"]')).find(cb => cb.value.toLowerCase() === deviceName.toLowerCase());
                    if (existingCheckbox) {
                        existingCheckbox.checked = true;
                    } else {
                        addCustomDispositivo(deviceName, true);
                    }
                });
            }

            // Medicações
            if (data.medicamentos && data.medicamentos.length > 0) {
                enterEditMode(document.getElementById('module-medicacoes'));
                const now = new Date();
                data.medicamentos.forEach(med => {
                    if (med.nome && med.horario) {
                        const [hours, minutes] = med.horario.split(':').map(Number);
                        if (isNaN(hours) || isNaN(minutes)) return;

                        let medTime = new Date();
                        medTime.setHours(hours, minutes, 0, 0);

                        // Se o horário já passou hoje, considera como administrado. Se não, como agendado.
                        if (medTime <= now) {
                            administeredInShift.push({
                                id: `med_${medTime.getTime()}`,
                                name: med.nome,
                                dose: 'Ajustar', // Usuário precisará ajustar a dose
                                time: medTime,
                                prescriptionId: `single_voice_${medTime.getTime()}`
                            });
                        } else {
                            activePrescriptions.push({
                                id: `med_${medTime.getTime()}`,
                                name: med.nome,
                                dose: 'Ajustar',
                                time: medTime,
                                prescriptionId: `single_voice_${medTime.getTime()}`
                            });
                        }
                    }
                });
                renderMedicationLists();
            }
            
            // Exames
            if (data.exames && data.exames.length > 0) {
                const moduleCard = document.getElementById('module-exames');
                if (moduleCard) enterEditMode(moduleCard);
                
                const now = new Date();
                
                data.exames.forEach(exam => {
                    if (!exam.nome || exam.nome.trim() === '') return;

                    const examDate = exam.dataHora ? new Date(exam.dataHora.replace(' ', 'T')) : now;
                    
                    const newExam = {
                        id: `exam_${Date.now()}_${Math.random()}`,
                        name: exam.nome.trim(),
                        timestamp: examDate.getTime(),
                        result: (exam.resultado || '').trim()
                    };

                    if (newExam.result) {
                        // Se tem resultado, vai para a lista de concluídos do plantão
                        newExam.status = 'completed';
                        currentShiftCompletedExams.push(newExam);
                    } else if (examDate <= now) {
                        // Se a data já passou e não tem resultado, fica pendente
                        newExam.status = 'pending';
                        patientExams.push(newExam);
                    } else {
                        // Se a data é futura, fica agendado
                        newExam.status = 'scheduled';
                        patientExams.push(newExam);
                    }
                });

                renderExams(); // Re-renderiza as listas de exames na tela
            }

            // Campos de Texto (Evolução e Observações)
            let evolutionText = (document.getElementById('form-evolution').value || '').trim();
            if (data.observacoes) {
                 evolutionText += (evolutionText ? '\n\n' : '') + `Observações da Passagem por Voz:\n${data.observacoes}`;
            }
            fillAndDispatch('form-evolution', evolutionText.trim());

            // Atualizações finais
            updateDiagnosisSummary();
            updateLiveScores();
            setUnsavedChanges(true);
            console.log("Preenchimento automático finalizado.");
        }

        //FUNCIONALIDADE DE GRAVAÇÃO DE VOZ

        // 1. Seleciona o botão de gravação que adicionamos no HTML
        const recordButton = document.getElementById('record-handover-button');
        const soundWaveContainer = document.getElementById('sound-wave-container');

        // 2. Verifica se o navegador suporta a Web Speech API
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Seu navegador não suporta a Web Speech API. Tente usar o Google Chrome.");
            // Opcional: desabilitar o botão se a API não for suportada
            if(recordButton) recordButton.disabled = true;
        }

        // 3. Adiciona o evento de clique ao botão
        recordButton.addEventListener('click', () => {
            if (!SpeechRecognition) {
                alert("Desculpe, seu navegador não suporta a funcionalidade de voz.");
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.lang = 'pt-BR';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            const originalButtonContent = recordButton.innerHTML;
            const spinnerHtml = `
                <svg class="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            `;

            // Feedback de carregamento imediato no botão
            recordButton.disabled = true;
            recordButton.innerHTML = spinnerHtml;
            recordButton.title = "Aguardando navegador...";

            recognition.start();

            // Evento que dispara QUANDO o navegador realmente começa a ouvir
            recognition.onstart = () => {
                console.log("Reconhecimento de voz efetivamente iniciado.");
                soundWaveContainer.classList.remove('hidden');
                soundWaveContainer.classList.add('flex');
                recordButton.classList.remove('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
                recordButton.classList.add('bg-red-100', 'text-red-700', 'animate-pulse');
                recordButton.title = "Gravando... Clique para parar.";
                recordButton.innerHTML = originalButtonContent;
            };

            recognition.onresult = async (event) => {
                const speechResult = event.results[0][0].transcript;
                console.log('Sucesso! Texto reconhecido:', speechResult);

                showActionLoader();
                recordButton.title = "Processando com a IA...";

                try {
                    const structuredData = await getStructuredDataFromVoice(speechResult);

                    if (structuredData) {
                        const formattedData = formatStructuredData(structuredData);
                        openConfirmationPopup(formattedData);
                    }
                } catch (error) {
                    console.error("Erro no fluxo de processamento da IA:", error);
                } finally {
                    hideActionLoader();
                }
            };

            recognition.onerror = (event) => {
                console.error('Erro no reconhecimento de voz:', event.error);
                alert(`Erro no reconhecimento: ${event.error}`);
                // Garante que o botão seja restaurado mesmo em caso de erro
                recordButton.disabled = false;
                recordButton.innerHTML = originalButtonContent;
            };

            recognition.onend = () => {
                console.log("Reconhecimento de voz finalizado.");
                soundWaveContainer.classList.add('hidden');
                soundWaveContainer.classList.remove('flex');
                recordButton.classList.add('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
                recordButton.classList.remove('bg-red-100', 'text-red-700', 'animate-pulse');
                recordButton.title = "Passagem de Plantão por Voz";
                recordButton.disabled = false;
                recordButton.innerHTML = originalButtonContent;
            };

            // Permite que o usuário clique no botão novamente para parar a gravação
            recordButton.onclick = () => {
                recognition.stop();
                // Remove o listener para evitar múltiplos cliques de parada
                recordButton.onclick = null; 
            };
        });

        // --- INÍCIO: LÓGICA DE AUTOCOMPLETE PARA O POPUP DE VOZ ---

        const aiPopupContainer = document.getElementById('ai-confirmation-popup');
        let activePopupAutocomplete = null;
        /**
         * Renderiza e posiciona a lista de autocomplete DENTRO do popup.
         * @param {HTMLInputElement} inputElement - O input que acionou a busca.
         * @param {string[]} suggestions - As sugestões a serem exibidas.
         * @param {'diagnosis' | 'medication'} type - O tipo de busca.
         */
        function renderPopupAutocomplete(inputElement, suggestions, type) {
            const listId = type === 'diagnosis' ? 'popup-diagnosis-autocomplete-list' : 'popup-medication-autocomplete-list';
            const listElement = document.getElementById(listId);
            
            listElement.innerHTML = '';
            listElement.classList.add('hidden');

            if (suggestions.length === 0) {
                listElement.innerHTML = '<div class="p-3 text-center text-sm text-gray-500 italic">Nenhuma sugestão encontrada.</div>';
            } else {
                suggestions.forEach(suggestion => {
                    const item = document.createElement('div');
                    item.className = 'popup-autocomplete-item';
                    item.textContent = suggestion;
                    item.addEventListener('click', () => {
                        inputElement.value = suggestion; // Atualiza o input
                        listElement.classList.add('hidden'); // Esconde a lista
                        activePopupAutocomplete = null;
                    });
                    listElement.appendChild(item);
                });
            }

            // Posiciona a lista abaixo do input correto e a exibe
            const inputRect = inputElement.getBoundingClientRect();
            const popupRect = aiPopupContainer.getBoundingClientRect();
            listElement.style.top = `${inputRect.bottom - popupRect.top + 4}px`;
            listElement.style.left = `${inputRect.left - popupRect.left}px`;
            listElement.style.width = `${inputRect.width}px`;
            
            listElement.classList.remove('hidden');
            activePopupAutocomplete = listElement;
        }

        // Listener de evento principal para o popup
        aiPopupContainer.addEventListener('click', async (e) => {
            const searchButton = e.target.closest('.popup-search-icon');
            const suggestionButton = e.target.closest('.device-suggestion-button');
            
            // Se o clique foi fora de uma lista de autocomplete ativa, fecha ela
            if (activePopupAutocomplete && !e.target.closest('.popup-autocomplete-list')) {
                activePopupAutocomplete.classList.add('hidden');
                activePopupAutocomplete = null;
            }

            // Lógica 1: Se clicou no ícone de busca (lupa)
            if (searchButton) {
                e.preventDefault();
                const searchIcon = searchButton.querySelector('.search-icon');
                const spinnerIcon = searchButton.querySelector('.spinner-icon');

                // Mostra o spinner e desabilita o botão
                searchIcon.classList.add('hidden');
                spinnerIcon.classList.remove('hidden');
                searchButton.disabled = true;
                const targetInputId = searchButton.dataset.targetInput;
                const searchType = searchButton.dataset.searchType;
                const inputElement = document.getElementById(targetInputId);
                const query = inputElement.value;

                if (query.length < 2) {
                    showToast("Digite pelo menos 2 caracteres para buscar.", "warning");
                    return;
                }
                
                showToast("Buscando sugestões...", 1500);

                let suggestions = [];
                if (searchType === 'diagnosis') {
                    const geminiTerms = await getGeminiSuggestions(query);
                    const results = await Promise.all(geminiTerms.map(term => searchFirestoreCID(term, null, null, false)));
                    const flatResults = results.flat();
                    const uniqueNames = [...new Map(flatResults.map(item => [item.name, item])).values()].map(item => item.name);
                    suggestions = uniqueNames;
                } else if (searchType === 'medication') {
                    const geminiTerms = await getGeminiMedicationSuggestions(query);
                    const results = await Promise.all(geminiTerms.map(term => fetchMedicationSuggestions(term, null, null, false)));
                    suggestions = [...new Set(results.flat())];
                }

                renderPopupAutocomplete(inputElement, suggestions, searchType);
                // Esconde o spinner e reabilita o botão
                searchIcon.classList.remove('hidden');
                spinnerIcon.classList.add('hidden');
                searchButton.disabled = false;
            }

            // Lógica 2: Se clicou no botão de sugestão de dispositivo
            if (suggestionButton) {
                e.preventDefault();
                const targetInputId = suggestionButton.dataset.targetInput;
                const suggestion = suggestionButton.dataset.suggestion;
                const inputElement = document.getElementById(targetInputId);
                
                if (inputElement) {
                    inputElement.value = suggestion; // Substitui o texto do input pela sugestão
                    suggestionButton.style.display = 'none'; // Esconde o botão após ser usado
                }
            }
        });
