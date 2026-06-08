import { FaFileInvoiceDollar, FaFileContract, FaTruck, FaFile, FaLandmark, FaMoneyBillWave } from "react-icons/fa";

// Document types configuration (labels come from i18n)
export const DOCUMENT_TYPES = [
    {
        id: 'invoice',
        code: 'SUPPLIER_INVOICE',
        i18nKey: 'supplier-invoice',
        icon: FaFileInvoiceDollar,
        color: 'bg-blue-500'
    },
    {
        id: 'order',
        code: 'SUPPLIER_ORDER',
        i18nKey: 'supplier-order',
        icon: FaFileContract,
        color: 'bg-green-500'
    },
    {
        id: 'delivery',
        code: 'DELIVERY_NOTE',
        i18nKey: 'delivery-note',
        icon: FaTruck,
        color: 'bg-orange-500'
    },
    {
        id: 'other',
        code: 'ADMINISTRATIVE',
        i18nKey: 'other',
        icon: FaFile,
        color: 'bg-gray-500'
    },
    {
        id: 'payslip',
        code: 'PAYSLIP',
        i18nKey: 'payslip',
        icon: FaMoneyBillWave,
        color: 'bg-purple-500'
    },
    {
        id: 'bank_statement',
        code: 'BANK_STATEMENT',
        i18nKey: 'bank-statement',
        icon: FaLandmark,
        color: 'bg-indigo-500'
    }
];

// Language codes for OCR
export const LANGUAGE_CODES = ['fra', 'eng', 'deu', 'spa', 'ita', 'nld'];

// Map UI document type codes to backend target_type values
export const DOC_TYPE_TO_TARGET_TYPE = {
    'SUPPLIER_INVOICE': 'facture_fourn',
    'SUPPLIER_ORDER': 'commande_fournisseur',
    'PAYSLIP': 'salary',
    'BANK_STATEMENT': 'bank_statement'
};

// Supplier document types (for line extraction)
export const SUPPLIER_DOC_TYPES = ['SUPPLIER_INVOICE', 'SUPPLIER_ORDER', 'DELIVERY_NOTE'];

// Column roles for PDFTableSelector per document type
export const SUPPLIER_COLUMN_ROLES = {
    SUPPLIER_INVOICE: ['ignore', 'product_ref', 'description', 'quantity', 'unit_price', 'unit_price_ttc', 'discount', 'vat_rate', 'line_total', 'line_total_ttc'],
    SUPPLIER_ORDER: ['ignore', 'product_ref', 'description', 'quantity', 'unit_price', 'unit_price_ttc', 'discount', 'vat_rate', 'line_total', 'line_total_ttc'],
    DELIVERY_NOTE: ['ignore', 'product_ref', 'description', 'quantity'],
};

// Field mapping from extraction schema keys to form field names
export const CLIENT_FIELD_MAPPING = {
    amount: 'amount_ttc',
    amount_ttc: 'amount_ttc',
    amount_untaxed: 'amount_untaxed',
    vat_amount: 'vat_amount',
    invoice_number: 'invoice_number',
    invoice_date: 'invoice_date',
    date: 'invoice_date',
    due_date: 'due_date',
    supplier_name: 'supplier_name',
    supplier_vat: 'supplier_vat',
    employee_name: 'employee_name',
    ref_employee: 'ref_employee',
    net_amount: 'net_amount',
    gross_amount: 'gross_amount',
    period_start: 'period_start',
    period_end: 'period_end'
};

// Fallback field definitions if API is not available
export const getDefaultFieldDefinitions = (docType) => {
    const defaults = {
        'SUPPLIER_INVOICE': [
            { code: 'supplier_name', label: 'Nom du fournisseur', field_type: 'text', is_required: true },
            { code: 'supplier_vat', label: 'N° TVA Intracommunautaire', field_type: 'text', is_required: false },
            { code: 'invoice_number', label: 'N° Facture', field_type: 'text', is_required: true },
            { code: 'invoice_date', label: 'Date facture', field_type: 'date', is_required: true },
            { code: 'due_date', label: 'Date échéance', field_type: 'date', is_required: false },
            { code: 'amount_untaxed', label: 'Montant HT', field_type: 'number', is_required: false },
            { code: 'amount_ttc', label: 'Montant TTC', field_type: 'number', is_required: true }
        ],
        'SUPPLIER_ORDER': [
            { code: 'supplier_name', label: 'Nom du fournisseur', field_type: 'text', is_required: true },
            { code: 'order_number', label: 'N° Commande', field_type: 'text', is_required: true },
            { code: 'order_date', label: 'Date commande', field_type: 'date', is_required: true },
            { code: 'amount_ttc', label: 'Montant TTC', field_type: 'number', is_required: false }
        ],
        'DELIVERY_NOTE': [
            { code: 'supplier_name', label: 'Nom du fournisseur', field_type: 'text', is_required: true },
            { code: 'delivery_number', label: 'N° Bon de livraison', field_type: 'text', is_required: true },
            { code: 'delivery_date', label: 'Date livraison', field_type: 'date', is_required: true },
            { code: 'order_reference', label: 'Réf. commande', field_type: 'text', is_required: false }
        ],
        'PAYSLIP': [
            { code: 'employee_name', label: 'Nom employé', field_type: 'text', is_required: false },
            { code: 'ref_employee', label: 'Matricule', field_type: 'text', is_required: false },
            { code: 'net_amount', label: 'Net à payer', field_type: 'number', is_required: true },
            { code: 'gross_amount', label: 'Salaire brut', field_type: 'number', is_required: false },
            { code: 'period_start', label: 'Début période', field_type: 'date', is_required: true },
            { code: 'period_end', label: 'Fin période', field_type: 'date', is_required: false }
        ],
        'BANK_STATEMENT': [
            { code: 'supplier_name', label: 'Banque', field_type: 'text', is_required: false },
            { code: 'account_number', label: 'N° Compte', field_type: 'text', is_required: false },
            { code: 'document_number', label: 'N° Relevé', field_type: 'text', is_required: false },
            { code: 'date_start', label: 'Date début', field_type: 'date', is_required: false },
            { code: 'date_end', label: 'Date fin', field_type: 'date', is_required: false },
            { code: 'prev_balance', label: 'Ancien solde', field_type: 'number', is_required: false },
            { code: 'new_balance', label: 'Nouveau solde', field_type: 'number', is_required: false }
        ]
    };
    return defaults[docType] || [
        { code: 'title', label: 'Titre', field_type: 'text', is_required: true },
        { code: 'date', label: 'Date', field_type: 'date', is_required: false },
        { code: 'description', label: 'Description', field_type: 'text', is_required: false }
    ];
};
