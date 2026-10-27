/**
 * Activity blueprints transcribed from the client PPT (20261023_EPMP_Swimlanes_v2):
 * PP #1–#16, MPP, and Pilot/SOP activities. Each activity's fields carry the PPT's
 * "Entered by / Source / Validated by" mapping. Built with a small DSL for readability.
 *
 * Mapping used (PPT → schema):
 *   Entered by: PIC→PIC, Vendor→Vendor, System/Bot→System, Central Coordinator→ModelCoordinator,
 *               Admin/Super Admin→Admin.
 *   Source:     EPMP manual→manual, EPMP calculated/log/rule/auto→calculated, ENOVIA→enovia, SAP→sap,
 *               E-Doc→edoc, Regulatory App→regapp, LMS/IBOM/MISP/Master Excel/Q-prime→mapping, upload→upload.
 *   Validated by PIC → validatedBy:'PIC'.
 */
import type { ActivityDefinition, FieldDefinition, FieldType, FieldSource, TableColumn, ApprovalFlow } from '../domain'
import type { PersonaId } from '../store/personaStore'

type Enter = PersonaId | 'System'

/** Terse field spec. */
interface FSpec {
  k: string            // key
  l: string            // label
  t?: FieldType        // type (default text)
  o?: string[]         // options (dropdown/multiSelect)
  cols?: TableColumn[] // table columns
  by?: Enter           // enteredBy (default PIC)
  src?: FieldSource    // source (default manual)
  val?: boolean        // validatedBy PIC
  req?: boolean        // mandatory
  dash?: boolean       // showOnDashboard
  list?: boolean       // showInPartList
}

function f(s: FSpec): FieldDefinition {
  return {
    key: s.k,
    label: s.l,
    type: s.t ?? 'text',
    options: s.o,
    columns: s.cols,
    mandatory: s.req ?? false,
    enteredBy: s.by ?? 'PIC',
    source: s.src ?? 'manual',
    validatedBy: s.val ? 'PIC' : null,
    showOnDashboard: s.dash ?? false,
    showInPartList: s.list || undefined
  }
}

/** Vendor→PIC two-step flow (used when any field is vendor-entered / PIC-validated). */
const FLOW_VENDOR_PIC: ApprovalFlow = {
  steps: [
    { stepIndex: 0, role: 'Vendor', label: 'Vendor Entry', allowedOutcomes: ['Submit'] },
    { stepIndex: 1, role: 'PIC', label: 'PIC Validation', allowedOutcomes: ['Approve', 'Edit', 'Send back'] }
  ]
}
/** PIC-only single-step flow (no vendor entry). */
const FLOW_PIC: ApprovalFlow = {
  steps: [{ stepIndex: 0, role: 'PIC', label: 'PIC Confirmation', allowedOutcomes: ['Approve', 'Edit'] }]
}

interface BSpec {
  id: string
  name: string
  fields: FSpec[]
  owner?: PersonaId
  scope?: 'NewPart' | 'ECN' | 'Both'
  na?: boolean          // allowNotApplicable
  vendorTimeline?: boolean
  desc?: string
}

function blueprint(b: BSpec): ActivityDefinition {
  const fields = b.fields.map(f)
  const anyVendor = fields.some((x) => x.enteredBy === 'Vendor' || x.validatedBy === 'PIC')
  return {
    id: b.id,
    name: b.name,
    scope: b.scope ?? 'Both',
    ownerPersona: b.owner ?? 'PIC',
    description: b.desc,
    allowNotApplicable: b.na ?? true,
    allowVendorPlannedTimeline: b.vendorTimeline || undefined,
    // Prebuilt activities use the standard deviation approval chain: PIC → SIC → DPM.
    deviationFlow: ['PIC', 'SIC', 'DPM'],
    published: true,
    fields,
    flow: anyVendor ? FLOW_VENDOR_PIC : FLOW_PIC
  }
}

// Shortcuts for common deviation/E-Doc trailer fields used across inspection-style activities.
const edocNumber: FSpec = { k: 'edoc_number', l: 'E-Doc number', src: 'edoc', by: 'PIC' }
const edocStatus: FSpec = { k: 'deviation_status', l: 'Deviation approval status', t: 'dropdown', o: ['Approved', 'Pending', 'Rejected', 'In progress'], by: 'System', src: 'edoc' }

// ── PP phase (16) ───────────────────────────────────────────────────────────

export const PP_BLUEPRINTS: ActivityDefinition[] = [
  blueprint({
    id: 'pp-1', name: 'PP #1 Parts drawing confirmation in IBOM',
    desc: 'PIC confirms drawing availability for every assigned part and classifies it as MSIL or Proprietary; missing drawings get a target date.',
    fields: [
      { k: 'drawing_applicability', l: 'Drawing applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'drawing_availability', l: 'Drawing availability', t: 'dropdown', o: ['Available', 'Not available'], by: 'System', src: 'mapping', dash: true, list: true, req: true },
      { k: 'part_classification', l: 'Part classification', t: 'dropdown', o: ['MSIL', 'Proprietary'], by: 'PIC', dash: true, list: true },
      { k: 'target_date_msil', l: 'Target date – MSIL drawing', t: 'date', by: 'System', src: 'calculated' },
      { k: 'target_date_proprietary', l: 'Target date – Proprietary part', t: 'date', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-2', name: 'PP #2 Spec meeting confirmation — OE & accessory parts',
    desc: 'Meeting classification from ENOVIA, status from SAP. Vendor enters planned/actual dates; PIC validates.',
    vendorTimeline: true,
    fields: [
      { k: 'meeting_classification', l: 'Tech / process meeting classification', t: 'dropdown', o: ['Tech meeting', 'Process meeting'], by: 'System', src: 'enovia', dash: true, list: true, req: true },
      { k: 'spec_meeting_status', l: 'Spec meeting status', t: 'dropdown', o: ['Not Initiated', 'Initiated', 'Pending for approval', 'Approved'], by: 'System', src: 'sap', dash: true, list: true },
      { k: 'planned_start_system', l: 'Planned start (system)', t: 'date', by: 'System', src: 'calculated' },
      { k: 'planned_finish_system', l: 'Planned finish (system)', t: 'date', by: 'System', src: 'calculated' },
      { k: 'planned_start_vendor', l: 'Planned start (vendor)', t: 'date', by: 'Vendor', val: true },
      { k: 'planned_finish_vendor', l: 'Planned finish (vendor)', t: 'date', by: 'Vendor', val: true },
      { k: 'actual_start', l: 'Actual start', t: 'date', by: 'System', src: 'sap' },
      { k: 'actual_finish', l: 'Actual finish', t: 'date', by: 'System', src: 'sap' }
    ]
  }),
  blueprint({
    id: 'pp-3', name: 'PP #3 SOR sharing and confirmation of SOR points',
    desc: 'Vendor enters agreed/disagreed counts and lists disagreed points; PIC categorises each (as-is, alternate control, not feasible, denial, cost up).',
    fields: [
      { k: 'sor_not_applicable', l: 'Not applicable', t: 'number', by: 'Vendor', val: true },
      { k: 'sor_agree', l: 'Agree', t: 'number', by: 'Vendor', val: true, dash: true },
      { k: 'sor_disagree', l: 'Disagree', t: 'number', by: 'Vendor', val: true, dash: true },
      { k: 'sor_disagreed_points', l: 'Disagreed SOR points', t: 'table', by: 'Vendor', val: true,
        cols: [
          { key: 'sor_category', label: 'SOR category', type: 'text' },
          { key: 'sor_point', label: 'SOR point', type: 'longText' },
          { key: 'pic_category', label: 'PIC categorisation', type: 'dropdown', options: ['Agreed – As is', 'Agreed – Alternate control', 'Not feasible', 'Denial', 'Cost up'], enteredBy: 'PIC' },
          { key: 'pic_remark', label: 'PIC remark', type: 'longText', enteredBy: 'PIC' }
        ] },
      { k: 'agreed_as_is', l: 'Agreed – As is', t: 'number', by: 'PIC' },
      { k: 'agreed_alt_control', l: 'Agreed – Alternate control', t: 'number', by: 'PIC' },
      { k: 'not_feasible', l: 'Not agreed – Not feasible', t: 'number', by: 'PIC' },
      { k: 'denial', l: 'Not agreed – Denial', t: 'number', by: 'PIC' },
      { k: 'cost_up', l: 'Not agreed – Cost up', t: 'number', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-4', name: 'PP #4 Tier-2 compilation (Red and New assessment check)',
    desc: 'Tier-2 suppliers compiled from SAP; vendor gives planned BOM upload date (before spec meeting).',
    fields: [
      { k: 'tier2_code', l: 'Tier-2 supplier code', t: 'number', by: 'System', src: 'sap' },
      { k: 'tier2_name', l: 'Tier-2 supplier name', t: 'text', by: 'System', src: 'sap' },
      { k: 'tier2_status', l: 'Tier-2 status', t: 'dropdown', o: ['R', 'Y', 'G', 'New (Unaudited)', 'Tier-1', 'Directed Tier-2', 'Overseas', 'Trader', 'RM', 'Catalogue part', 'Consumables'], by: 'System', src: 'mapping', dash: true },
      { k: 'tier2_unique_count', l: 'Unique Tier-2 count', t: 'number', by: 'System', src: 'calculated' },
      { k: 'planned_bom_upload', l: 'Planned BOM upload date', t: 'date', by: 'Vendor', val: true }
    ]
  }),
  blueprint({
    id: 'pp-5', name: 'PP #5 New Tier-2 assessment confirmation',
    desc: 'New Tier-2 vendors from SAP; PIC confirms audit status.',
    fields: [
      { k: 'new_tier2_code', l: 'New Tier-2 vendor code', t: 'text', by: 'System', src: 'sap' },
      { k: 'new_tier2_name', l: 'New Tier-2 vendor name', t: 'text', by: 'System', src: 'sap' },
      { k: 'new_tier2_total', l: 'New Tier-2 total', t: 'number', by: 'System', src: 'calculated' },
      { k: 'audit_status', l: 'Audit status', t: 'dropdown', o: ['Done', 'Not done'], by: 'PIC', dash: true, list: true }
    ]
  }),
  blueprint({
    id: 'pp-6a', name: 'PP #6a Newness confirmation — Mizenboshi status',
    desc: 'PIC records Mizenboshi newness score/type and item acceptance; runs till MPP.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'newness_score', l: 'Newness score', t: 'dropdown', o: ['3', '4', '5'], by: 'PIC', dash: true },
      { k: 'newness_type', l: 'Newness type', t: 'dropdown', o: ['New Technology', 'New Process'], by: 'PIC' },
      { k: 'remark', l: 'Remark', t: 'longText', by: 'PIC' },
      { k: 'mizenboshi_count', l: 'Count of Mizenboshi items', t: 'number', by: 'PIC' },
      { k: 'mizenboshi_status', l: 'Mizenboshi item status', t: 'dropdown', o: ['Accepted', 'Rejected by Engineering'], by: 'PIC' },
      { k: 'rejection_reason', l: 'Reason for rejection', t: 'longText', by: 'PIC' },
      { k: 'planned_start', l: 'Planned start / end date', t: 'text', by: 'PIC' },
      { k: 'actual_start', l: 'Actual start / end date', t: 'text', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-6b', name: 'PP #6b Newness confirmation — Process benchmarking status',
    desc: 'Benchmarking observations raised and agreed/implemented with the vendor.',
    fields: [
      { k: 'newness_applicability', l: 'Newness applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'newness_type', l: 'Newness type', t: 'dropdown', o: ['New Tech / New Design', 'New Vendor', 'Existing vendor New part category', 'New Process', 'New Plant', 'New Material', 'Localization', 'Others'], by: 'System', src: 'sap' },
      { k: 'newness_remark', l: 'Newness remark', t: 'longText', by: 'PIC' },
      { k: 'benchmarking_applicability', l: 'Benchmarking applicability', t: 'yesNo', by: 'PIC' },
      { k: 'observations_count', l: 'Total count of observations', t: 'number', by: 'Vendor', val: true },
      { k: 'observation', l: 'Observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'observation_agreed', l: 'Observations agreed / not agreed', t: 'dropdown', o: ['Agree', 'Disagree'], by: 'Vendor', val: true },
      { k: 'target_date', l: 'Target date for implementation (agreed)', t: 'date', by: 'Vendor', val: true },
      { k: 'implemented', l: 'Implemented / Not implemented', t: 'dropdown', o: ['Implemented', 'Not implemented'], by: 'Vendor', val: true }
    ]
  }),
  blueprint({
    id: 'pp-7', name: 'PP #7 DMU data study status (ECR status)',
    desc: 'DMU observations shared and tracked to closure.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'dmu_status', l: 'DMU status (observation shared)', t: 'dropdown', o: ['Completed', 'Pending'], by: 'PIC', dash: true },
      { k: 'dmu_observations', l: 'DMU observations', t: 'number', by: 'PIC' },
      { k: 'observation_status', l: 'Observation status', t: 'dropdown', o: ['Open', 'Close', 'Reject'], by: 'PIC' },
      { k: 'open_target_date', l: 'Open – target date', t: 'date', by: 'PIC' },
      { k: 'closed_status', l: 'Closed – Accept / Reject', t: 'dropdown', o: ['Accept', 'Reject'], by: 'PIC' },
      { k: 'reject_reason', l: 'Reject reason', t: 'longText', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-8', name: 'PP #8 SES NR status (drawing study + ECR initiation)',
    desc: 'Vendor records applicable/available parameters; PIC tracks ECR raised, feedback and drawing implementation.',
    fields: [
      { k: 'ses_nr_applicable', l: 'SES NR applicable', t: 'yesNo', by: 'PIC', req: true },
      { k: 'applicable_params', l: 'Count of applicable parameters', t: 'number', by: 'Vendor', val: true },
      { k: 'available_count', l: 'Available count (against drawing)', t: 'number', by: 'Vendor', val: true },
      { k: 'not_available_count', l: 'Not available count', t: 'number', by: 'System', src: 'calculated' },
      { k: 'ecr_raised', l: 'ECR raised (not-available parameters)', t: 'yesNo', by: 'PIC' },
      { k: 'feedback_received', l: 'Feedback received from Engineering', t: 'yesNo', by: 'PIC' },
      { k: 'agreed_by_eng', l: 'Agreed by Engineering', t: 'yesNo', by: 'PIC' },
      { k: 'rejected_by_eng', l: 'Rejected by Engineering', t: 'longText', by: 'PIC' },
      { k: 'implemented_in_drawing', l: 'Implemented in drawing', t: 'yesNo', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-9', name: 'PP #9 OT status',
    desc: 'Tool cutting/assembly/trial and OT tracked; vendor enters actuals, PIC validates OT date; deviations via E-Doc.',
    vendorTimeline: true,
    fields: [
      { k: 'tool_go_ahead_applicable', l: 'Applicability of MSIL Tool Go Ahead', t: 'yesNo', by: 'PIC' },
      { k: 'trial_end_date', l: 'Trial end date', t: 'date', by: 'ModelCoordinator' },
      { k: 'tool_go_ahead_date', l: 'MSIL Tool Go Ahead date', t: 'date', by: 'Vendor' },
      { k: 'tool_go_ahead_remark', l: 'Tool Go Ahead remark', t: 'longText', by: 'Vendor' },
      { k: 'tool_cutting_status', l: 'Tool cutting status', t: 'dropdown', o: ['Started', 'Completed'], by: 'Vendor', val: true },
      { k: 'tool_assembly_status', l: 'Tool assembly status', t: 'dropdown', o: ['Started', 'Completed'], by: 'Vendor', val: true },
      { k: 'tool_trial_status', l: 'Tool trial status', t: 'dropdown', o: ['Started', 'Completed'], by: 'Vendor', val: true },
      { k: 'ot_planned_date', l: 'OT planned date', t: 'date', by: 'Vendor', val: true },
      { k: 'actual_ot_date', l: 'Actual OT date', t: 'date', by: 'Vendor', val: true },
      { k: 'ot_status', l: 'OT status', t: 'dropdown', o: ['Pending', 'Verification pending', 'OT completed'], by: 'System', src: 'calculated', dash: true, list: true },
      { k: 'delay_reason', l: 'Delay reason and remark', t: 'dropdown', o: ['ECN case', 'Tool maker selection delay', 'Tool go-ahead delay (MSIL)', 'Design finalization delay (Vendor internal)', 'Tool maturation delay', 'Delay at tool maker', 'Others'], by: 'Vendor', val: true },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'pp-10', name: 'PP #10 Sheet metal part accuracy status',
    desc: 'Inspection accuracy per part; NG handled with observation, correction timeline and deviation.',
    fields: [
      { k: 'inspection_applicability', l: 'Inspection applicability', t: 'yesNo', by: 'Vendor', val: true, req: true },
      { k: 'inspection_target_date', l: 'Inspection target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'inspection_completed', l: 'Inspection completed', t: 'yesNo', by: 'System', src: 'sap' },
      { k: 'evidence', l: 'Evidence attachment', t: 'file', by: 'System', src: 'sap' },
      { k: 'inspection_status', l: 'Inspection status', t: 'dropdown', o: ['OK', 'NG'], by: 'Vendor', val: true, dash: true, list: true },
      { k: 'total_parameters', l: 'Total parameters', t: 'number', by: 'System', src: 'sap' },
      { k: 'ok_parameters', l: 'OK parameters', t: 'number', by: 'Vendor', val: true },
      { k: 'accuracy_pct', l: 'Accuracy %', t: 'percent', by: 'Vendor', val: true, dash: true },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'Vendor', val: true },
      { k: 'ng_dropdown', l: 'NG category', t: 'multiSelect', o: ['Appearance', 'Dimension', 'Material', 'Performance', 'Regulation'], by: 'Vendor', val: true },
      { k: 'ng_observation', l: 'NG observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'correction_timeline', l: 'Correction timeline', t: 'date', by: 'Vendor', val: true },
      { k: 'msil_inspection_completed', l: 'MSIL inspection completed', t: 'yesNo', by: 'PIC' },
      { k: 'msil_observation', l: 'MSIL observation', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC' },
      { k: 'correction_beyond_mrd', l: 'Correction beyond MRD', t: 'flag', by: 'System', src: 'calculated' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'pp-11', name: 'PP #11 Part inspection with deviation status',
    desc: 'Inspection with OK/NG, NG categories, correction timeline and deviation (E-Doc).',
    fields: [
      { k: 'inspection_applicability', l: 'Inspection applicability', t: 'yesNo', by: 'Vendor', val: true, req: true },
      { k: 'inspection_target_date', l: 'Inspection target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'inspection_completed', l: 'Inspection completed', t: 'yesNo', by: 'System', src: 'sap' },
      { k: 'evidence', l: 'Evidence attachment', t: 'file', by: 'System', src: 'sap' },
      { k: 'inspection_status', l: 'Inspection status', t: 'dropdown', o: ['OK', 'NG'], by: 'Vendor', val: true, dash: true, list: true },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'Vendor', val: true },
      { k: 'ng_dropdown', l: 'NG category', t: 'multiSelect', o: ['Appearance', 'Dimension', 'Material', 'Performance', 'Regulation'], by: 'Vendor', val: true },
      { k: 'ng_observation', l: 'NG observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'correction_timeline', l: 'Correction timeline', t: 'date', by: 'Vendor', val: true },
      { k: 'msil_inspection_completed', l: 'MSIL inspection completed', t: 'yesNo', by: 'PIC' },
      { k: 'msil_observation', l: 'MSIL observation', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC' },
      { k: 'correction_beyond_mrd', l: 'Correction beyond MRD', t: 'flag', by: 'System', src: 'calculated' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'pp-12', name: 'PP #12 MISP approval & uploading status',
    desc: 'PIC prepares, approves, uploads and shares MISP.',
    fields: [
      { k: 'misp_status', l: 'MISP status', t: 'dropdown', o: ['Approved', 'Pending approval'], by: 'PIC', dash: true, list: true },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'PIC' },
      { k: 'misp_prepared', l: 'MISP prepared', t: 'yesNo', by: 'PIC' },
      { k: 'misp_uploaded', l: 'MISP uploaded', t: 'yesNo', by: 'PIC' },
      { k: 'misp_shared', l: 'MISP shared with vendor', t: 'yesNo', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-13', name: 'PP #13 Lab testing status',
    desc: 'Testing planned and tracked via LMS; retests logged.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'testing_planned', l: 'Testing planned count', t: 'number', by: 'PIC' },
      { k: 'lab_request_raised', l: 'Lab request raised count', t: 'number', by: 'PIC' },
      { k: 'sample_submission', l: 'Sample submission', t: 'dropdown', o: ['Submitted', 'Not submitted'], by: 'System', src: 'mapping' },
      { k: 'testing_status', l: 'Testing status', t: 'dropdown', o: ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected'], by: 'System', src: 'mapping', dash: true, list: true },
      { k: 'retest_planned', l: 'Retest planned count', t: 'number', by: 'PIC' },
      { k: 'retest_request_raised', l: 'Retest lab request raised count', t: 'number', by: 'PIC' },
      { k: 'retest_status', l: 'Retest sample submission / status', t: 'dropdown', o: ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected'], by: 'System', src: 'mapping' }
    ]
  }),
  blueprint({
    id: 'pp-14', name: 'PP #14 BCF status (Body Checking Fixture)',
    desc: 'BCF completion with OK/NG, observation, action plan and revised date cycle.',
    fields: [
      { k: 'planned_target_date', l: 'Planned / target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'applicable_parts', l: 'Applicable parts', t: 'yesNo', by: 'PIC', req: true },
      { k: 'bcf_completed', l: 'BCF completed', t: 'yesNo', by: 'PIC' },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'PIC' },
      { k: 'bcf_status', l: 'BCF status', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC', dash: true, list: true },
      { k: 'evidence', l: 'Evidence attachment', t: 'file', by: 'PIC', src: 'upload' },
      { k: 'ng_remarks', l: 'Remarks for NG', t: 'longText', by: 'PIC' },
      { k: 'observation', l: 'Observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true },
      { k: 'action_target_date', l: 'Target date for action plan', t: 'date', by: 'Vendor', val: true },
      { k: 'revised_bcf_date', l: 'Revised BCF date (actual)', t: 'date', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-15a', name: 'PP #15A Colour parts check — Testing',
    desc: 'Colour testing via LMS with retests.',
    fields: [
      { k: 'applicable_parts', l: 'Applicable parts', t: 'yesNo', by: 'PIC', req: true },
      { k: 'colour_type', l: 'Colour type', t: 'dropdown', o: ['Old', 'New'], by: 'System', src: 'mapping' },
      { k: 'colour_code', l: 'Applicable colour code', t: 'text', by: 'System', src: 'mapping' },
      { k: 'testing_planned', l: 'Testing planned count', t: 'number', by: 'PIC' },
      { k: 'lab_request_raised', l: 'Lab request raised count', t: 'number', by: 'PIC' },
      { k: 'sample_submission', l: 'Sample submission', t: 'dropdown', o: ['Submitted', 'Not submitted'], by: 'System', src: 'mapping' },
      { k: 'testing_status', l: 'Testing status', t: 'dropdown', o: ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected'], by: 'System', src: 'mapping', dash: true },
      { k: 'retest_count', l: 'Retest planned / request count', t: 'number', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-15b', name: 'PP #15B Colour parts check — Colour comparison',
    desc: 'Colour comparison OK/NG with action plan and closure.',
    fields: [
      { k: 'applicability', l: 'Colour comparison applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'comparison_completed', l: 'Colour comparison completed', t: 'yesNo', by: 'PIC' },
      { k: 'status', l: 'Status', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC', dash: true, list: true },
      { k: 'ng_observation', l: 'Observation (NG)', t: 'longText', by: 'PIC' },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true },
      { k: 'target_date', l: 'Target date (correction timeline)', t: 'date', by: 'Vendor', val: true },
      { k: 'closure_status', l: 'Closure status', t: 'dropdown', o: ['Open', 'Closed'], by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pp-16', name: 'PP #16 Parts list with deviations & special parts list',
    desc: 'Rolls up deviations from earlier activities; Admin flags special parts.',
    fields: [
      { k: 'deviation_list', l: 'Deviation list', t: 'longText', by: 'System', src: 'calculated' },
      { k: 'correction_timeline', l: 'Correction timeline', t: 'date', by: 'System', src: 'calculated' },
      { k: 'deviation_count', l: 'Count of deviations', t: 'number', by: 'System', src: 'calculated', dash: true },
      edocNumber,
      { k: 'deviation_status', l: 'Deviation status', t: 'dropdown', o: ['Approved', 'Pending', 'Rejected'], by: 'System', src: 'edoc' },
      { k: 'special_part_applicable', l: 'Special part applicability', t: 'yesNo', by: 'Admin' },
      { k: 'special_part_activities', l: 'Applicable activities for special part', t: 'text', by: 'Admin' },
      { k: 'tool_readiness_target', l: 'Target date for tool readiness', t: 'date', by: 'Vendor', val: true }
    ]
  })
]

// ── MPP phase ────────────────────────────────────────────────────────────────

export const MPP_BLUEPRINTS: ActivityDefinition[] = [
  blueprint({
    id: 'mpp-1', name: 'MPP #1 OTOP status',
    desc: 'OTOP vs Non-OTOP with delay breakup and deviation; vendor enters actual, PIC validates.',
    vendorTimeline: true,
    fields: [
      { k: 'otop_target_date', l: 'OTOP target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'actual_otop_date', l: 'Actual OTOP date', t: 'date', by: 'Vendor', val: true },
      { k: 'otop_status', l: 'OTOP status', t: 'dropdown', o: ['OTOP', 'Non-OTOP'], by: 'System', src: 'calculated', dash: true, list: true },
      { k: 'non_otop_reason', l: 'Non-OTOP reason', t: 'dropdown', o: ['Process Maturation Delay', 'Software Readiness', 'Machine/Facility Delay', 'Source Selection Delay', 'Tool Not Ready', 'Process Not Ready'], by: 'Vendor', val: true },
      { k: 'non_otop_remark', l: 'Non-OTOP remark', t: 'longText', by: 'Vendor', val: true },
      { k: 'ecn_related', l: 'Due to ECN', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'actual_date_beyond_mrd', l: 'Actual date beyond MRD', t: 'flag', by: 'System', src: 'calculated' },
      { k: 'machine_installation_date', l: 'Machine installation date', t: 'date', by: 'Vendor' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'mpp-5', name: 'MPP #5 PP Hinkai trial closure status — QAND & Production',
    desc: 'Hinkai from IBOM; PIC shares defects to vendor who submits analysis + evidence.',
    fields: [
      { k: 'total_hinkai', l: 'Total Hinkai', t: 'number', by: 'System', src: 'mapping', dash: true },
      { k: 'e_hinkai', l: 'E-Hinkai count', t: 'number', by: 'System', src: 'mapping' },
      { k: 'p_hinkai', l: 'P-Hinkai count', t: 'number', by: 'System', src: 'mapping' },
      { k: 'approved_pending', l: 'Count approved / pending', t: 'number', by: 'System', src: 'mapping' },
      { k: 'overdue_count', l: 'Count of overdue', t: 'number', by: 'System', src: 'mapping' },
      { k: 'send_to_vendor', l: 'Send Hinkai (defect details) to vendor', t: 'yesNo', by: 'PIC' },
      { k: 'hinkai_details', l: 'Hinkai details', t: 'longText', by: 'PIC' },
      { k: 'target_date', l: 'Target date to vendor (Hinkai reply)', t: 'date', by: 'PIC' },
      { k: 'analysis_details', l: 'Analysis details', t: 'longText', by: 'Vendor', val: true, req: true },
      { k: 'attachment', l: 'Attachment', t: 'file', by: 'Vendor', val: true, src: 'upload' },
      { k: 'hinkai_reply_status', l: 'Hinkai reply status', t: 'dropdown', o: ['Replied by Vendor', 'Pending for reply'], by: 'System', src: 'calculated' }
    ]
  }),
  blueprint({
    id: 'mpp-6', name: 'MPP #6 SOR adherence confirmation (Div Head deviation via E-Doc)',
    desc: 'SOR points from PP tracked to implementation; vendor records implemented/under-progress/not-implemented.',
    fields: [
      { k: 'applicable_sor_points', l: 'Applicable SOR points', t: 'number', by: 'System', src: 'calculated' },
      { k: 'agree', l: 'Agree', t: 'number', by: 'System', src: 'calculated' },
      { k: 'disagree', l: 'Disagreed', t: 'number', by: 'System', src: 'calculated' },
      { k: 'total_implemented', l: 'Total implemented', t: 'number', by: 'Vendor', val: true, dash: true },
      { k: 'agreed_implemented', l: 'Agreed implemented count', t: 'number', by: 'Vendor', val: true },
      { k: 'disagreed_implemented', l: 'Disagreed implemented count', t: 'number', by: 'Vendor', val: true },
      { k: 'under_progress', l: 'Under progress count', t: 'number', by: 'Vendor', val: true },
      { k: 'under_progress_target', l: 'Target date (under progress)', t: 'date', by: 'Vendor', val: true },
      { k: 'not_implemented', l: 'Not implemented count', t: 'number', by: 'Vendor', val: true }
    ]
  }),
  blueprint({
    id: 'mpp-7', name: 'MPP #7 Lab testing status',
    desc: 'Testing via LMS with retest log.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'applicable_count', l: 'Applicable count', t: 'number', by: 'System', src: 'calculated' },
      { k: 'testing_planned', l: 'Testing planned count', t: 'number', by: 'PIC' },
      { k: 'lab_request_raised', l: 'Lab request raised count', t: 'number', by: 'PIC' },
      { k: 'sample_submission', l: 'Sample submission', t: 'dropdown', o: ['Submitted', 'Not submitted'], by: 'System', src: 'mapping' },
      { k: 'testing_status', l: 'Testing status', t: 'dropdown', o: ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected'], by: 'System', src: 'mapping', dash: true, list: true },
      { k: 'retest_planned', l: 'Retest planned count', t: 'number', by: 'PIC' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'mpp-8', name: 'MPP #8 Process audit status',
    desc: 'Process audit OK/NG with vendor action plan.',
    fields: [
      { k: 'applicability', l: 'Applicability (part-wise)', t: 'yesNo', by: 'PIC', req: true },
      { k: 'audit_planned_date', l: 'Audit planned date', t: 'date', by: 'PIC' },
      { k: 'audit_actual_date', l: 'Audit actual date', t: 'date', by: 'PIC' },
      { k: 'audit_completed', l: 'Audit completed / pending', t: 'dropdown', o: ['Completed', 'Pending'], by: 'System', src: 'calculated' },
      { k: 'audit_status', l: 'Audit status', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC', dash: true, list: true },
      { k: 'ng_observation', l: 'NG observation', t: 'longText', by: 'PIC' },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true },
      { k: 'target_date', l: 'Target date', t: 'date', by: 'Vendor', val: true },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'Vendor', val: true }
    ]
  }),
  blueprint({
    id: 'mpp-9', name: 'MPP #9 Process capability (critical parameters)',
    desc: 'Cpk counts by band; below 1.33 needs detail + 100% inspection.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'total_critical', l: 'Total critical parameters', t: 'number', by: 'Vendor', val: true },
      { k: 'count_below_133', l: 'Count below 1.33', t: 'number', by: 'Vendor', val: true, dash: true },
      { k: 'below_133_detail', l: 'Below 1.33 detail', t: 'table', by: 'Vendor', val: true,
        cols: [
          { key: 'parameter', label: 'Parameter details', type: 'text' },
          { key: 'concern', label: 'Concern details', type: 'longText' },
          { key: 'actual_value', label: 'Actual value', type: 'number' }
        ] },
      { k: 'full_inspection_done', l: '100% inspection done', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'count_133_167', l: 'Count 1.33 – 1.67', t: 'number', by: 'Vendor', val: true },
      { k: 'count_above_167', l: 'Count above 1.67', t: 'number', by: 'Vendor', val: true }
    ]
  }),
  blueprint({
    id: 'mpp-10', name: 'MPP #10 Homologation marking confirmation',
    desc: 'Regulatory marking / camera readiness tracked with the vendor.',
    fields: [
      { k: 'homologation_applicable', l: 'Homologation applicable', t: 'yesNo', by: 'PIC', req: true },
      { k: 'marking_applicable', l: 'Regulatory marking applicable', t: 'yesNo', by: 'PIC' },
      { k: 'camera_available', l: 'Camera available', t: 'yesNo', by: 'PIC' },
      { k: 'camera_considered', l: 'Camera already considered', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'target_remarks', l: 'Target date + remarks', t: 'date', by: 'Vendor', val: true },
      { k: 'camera_type', l: 'Camera type', t: 'dropdown', o: ['OCR', 'Image'], by: 'Vendor', val: true },
      { k: 'camera_implemented', l: 'Camera implemented', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'verification_completed', l: 'Verification completed', t: 'yesNo', by: 'PIC' },
      { k: 'delay_reason', l: 'Reason for delay', t: 'dropdown', o: ['SC approval pending', 'SC approved, vendor implementation pending', 'All approvals in, delay by vendor'], by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'mpp-11', name: 'MPP #11 Set part / semi-finished part status',
    desc: 'Set-part mapping against IBOM and F-drawing coverage in MISP.',
    fields: [
      { k: 'set_part_applicable', l: 'Set part applicable', t: 'yesNo', by: 'PIC', req: true },
      { k: 'sub_parts_mapping', l: 'Set part – sub parts mapping', t: 'longText', by: 'PIC' },
      { k: 'f_drawing_available', l: 'F drawing available', t: 'yesNo', by: 'PIC' },
      { k: 'f_drawing_in_misp', l: 'Coverage of F drawing instruction in MISP', t: 'yesNo', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'mpp-12', name: 'MPP #12 MISP revision status',
    desc: 'MISP revision required/done with reason.',
    fields: [
      { k: 'misp_revision', l: 'MISP revision', t: 'dropdown', o: ['Required', 'Not required'], by: 'PIC', dash: true, list: true },
      { k: 'reason', l: 'Reason', t: 'dropdown', o: ['ECN', 'Learning', 'Both', 'Others'], by: 'PIC' },
      { k: 'revision', l: 'Revision', t: 'dropdown', o: ['Done', 'Not done'], by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'mpp-13', name: 'MPP #13 Spare kit part status',
    desc: 'Spare-kit MISP & process audit with vendor action plan and deviation.',
    fields: [
      { k: 'applicable', l: 'Applicable spare kit parts', t: 'yesNo', by: 'PIC', req: true },
      { k: 'misp_approval', l: 'MISP approval as per drawing', t: 'dropdown', o: ['Done', 'Pending'], by: 'PIC' },
      { k: 'process_audit', l: 'Process audit as per spare kit check sheet', t: 'dropdown', o: ['Done', 'Pending'], by: 'Vendor', val: true },
      { k: 'audit_status', l: 'Audit status as per check sheet', t: 'dropdown', o: ['OK', 'NG'], by: 'Vendor', val: true, dash: true },
      { k: 'observation', l: 'Observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true },
      { k: 'target_date', l: 'Target date', t: 'date', by: 'Vendor', val: true },
      { k: 'beyond_mrd', l: 'Beyond MRD', t: 'flag', by: 'System', src: 'calculated' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'mpp-14', name: 'MPP #14 Parts list with deviations & special parts list',
    desc: 'Rolls up deviations; Admin flags special parts.',
    fields: [
      { k: 'deviation_list', l: 'Deviation list', t: 'longText', by: 'System', src: 'calculated' },
      { k: 'correction_timeline', l: 'Correction timeline', t: 'date', by: 'System', src: 'calculated' },
      { k: 'deviation_count', l: 'Count of deviations', t: 'number', by: 'System', src: 'calculated', dash: true },
      edocNumber,
      { k: 'deviation_status', l: 'Deviation status', t: 'dropdown', o: ['Approved', 'Pending', 'Rejected'], by: 'System', src: 'edoc' },
      { k: 'special_part_applicable', l: 'Special part applicability', t: 'yesNo', by: 'Admin' },
      { k: 'special_part_activities', l: 'Applicable activities for special part', t: 'text', by: 'Admin' },
      { k: 'tool_readiness_target', l: 'Target date for tool readiness', t: 'date', by: 'Vendor', val: true }
    ]
  })
]

// ── Pilot/SOP phase ─────────────────────────────────────────────────────────

export const PILOT_BLUEPRINTS: ActivityDefinition[] = [
  blueprint({
    id: 'pilot-1', name: 'Pilot/SOP #1 OTOP status (ECN cases)', scope: 'ECN',
    desc: 'OTOP re-confirmed for ECN parts in Pilot; independent of MPP OTOP.',
    vendorTimeline: true,
    fields: [
      { k: 'ecn_applicable', l: 'ECN applicable', t: 'yesNo', by: 'PIC', req: true },
      { k: 'otop_target_date', l: 'OTOP target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'actual_otop_date', l: 'Actual OTOP date', t: 'date', by: 'Vendor', val: true },
      { k: 'otop_status', l: 'OTOP status', t: 'dropdown', o: ['OTOP', 'Non-OTOP'], by: 'System', src: 'calculated', dash: true, list: true },
      { k: 'otop_delay_cases', l: 'OTOP delay cases', t: 'number', by: 'System', src: 'calculated' },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'Vendor', val: true },
      { k: 'actual_date_beyond_mrd', l: 'Actual date beyond MRD', t: 'flag', by: 'System', src: 'calculated' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'pilot-2', name: 'Pilot/SOP #2 Sheet metal part accuracy status',
    desc: 'Accuracy re-confirmed; NG handled with action plan, deviation/closure.',
    fields: [
      { k: 'applicable_parts', l: 'Applicable parts', t: 'yesNo', by: 'Vendor', val: true, req: true },
      { k: 'applicable_count', l: 'Applicable parts count', t: 'number', by: 'System', src: 'calculated' },
      { k: 'inspection_completed', l: 'Inspection completed', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'accuracy_target', l: 'Accuracy target', t: 'percent', by: 'System', src: 'calculated' },
      { k: 'accuracy_achieved', l: 'Accuracy achieved', t: 'percent', by: 'Vendor', val: true, dash: true },
      { k: 'not_achieved_reason', l: 'Not-achieved reason', t: 'longText', by: 'Vendor', val: true },
      { k: 'evidence', l: 'Evidence attachment', t: 'file', by: 'Vendor', val: true, src: 'upload' },
      { k: 'target_date', l: 'Target date for achieving accuracy', t: 'date', by: 'Vendor', val: true },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true },
      { k: 'action_result', l: 'Action result', t: 'dropdown', o: ['OK', 'NG', 'Deviation'], by: 'Vendor', val: true },
      edocNumber,
      { k: 'deviation_status', l: 'Deviation / closure status', t: 'dropdown', o: ['Accept', 'Pending', 'Reject', 'Open', 'Closed'], by: 'System', src: 'edoc' }
    ]
  }),
  blueprint({
    id: 'pilot-3', name: 'Pilot/SOP #3 Part inspection with deviation status (ECN cases)', scope: 'ECN',
    desc: 'Inspection re-run for ECN parts; NG, correction and deviation.',
    fields: [
      { k: 'inspection_target_date', l: 'Inspection target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'inspection_completed', l: 'Inspection completed', t: 'yesNo', by: 'System', src: 'sap' },
      { k: 'evidence', l: 'Evidence attachment', t: 'file', by: 'System', src: 'sap' },
      { k: 'inspection_status', l: 'Inspection status', t: 'dropdown', o: ['OK', 'NG'], by: 'Vendor', val: true, dash: true, list: true },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'Vendor', val: true },
      { k: 'ng_observation', l: 'NG observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'correction_timeline', l: 'Correction timeline', t: 'date', by: 'Vendor', val: true },
      { k: 'msil_inspection_completed', l: 'MSIL inspection completed', t: 'yesNo', by: 'PIC' },
      { k: 'msil_observation', l: 'MSIL observation', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC' },
      { k: 'correction_beyond_mrd', l: 'Correction beyond MRD', t: 'flag', by: 'System', src: 'calculated' },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber, edocStatus
    ]
  }),
  blueprint({
    id: 'pilot-4', name: 'Pilot/SOP #4 MPP Hinkai trial closure status — QAND & Production',
    desc: 'Hinkai raised/answered/pending tracked.',
    fields: [
      { k: 'total_hinkai', l: 'Total Hinkai', t: 'number', by: 'PIC', dash: true },
      { k: 'e_hinkai', l: 'E-Hinkai count', t: 'number', by: 'PIC' },
      { k: 'p_hinkai', l: 'P-Hinkai count', t: 'number', by: 'PIC' },
      { k: 'hinkai_status', l: 'Hinkai status', t: 'dropdown', o: ['Raised', 'Answered', 'Pending'], by: 'PIC', list: true },
      { k: 'count_breakup', l: 'Count raised / answered / pending', t: 'number', by: 'System', src: 'calculated' },
      { k: 'overdue_count', l: 'Count of overdue', t: 'number', by: 'System', src: 'calculated' }
    ]
  }),
  blueprint({
    id: 'pilot-5', name: 'Pilot/SOP #5 BCF status (Body Checking Fixture)',
    desc: 'BCF completion with OK/NG, action plan and revised date cycle.',
    fields: [
      { k: 'planned_target_date', l: 'Planned / target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'applicable_parts', l: 'Applicable parts', t: 'yesNo', by: 'PIC', req: true },
      { k: 'bcf_completed', l: 'BCF completed', t: 'yesNo', by: 'PIC' },
      { k: 'delay_reason', l: 'Delay reason', t: 'longText', by: 'PIC' },
      { k: 'bcf_status', l: 'BCF status', t: 'dropdown', o: ['OK', 'NG'], by: 'PIC', dash: true, list: true },
      { k: 'evidence', l: 'Evidence attachment', t: 'file', by: 'PIC', src: 'upload' },
      { k: 'ng_remarks', l: 'Remarks for NG', t: 'longText', by: 'PIC' },
      { k: 'observation', l: 'Observation', t: 'longText', by: 'Vendor', val: true },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true },
      { k: 'action_target_date', l: 'Target date for action plan', t: 'date', by: 'Vendor', val: true },
      { k: 'revised_bcf_date', l: 'Revised BCF date (actual)', t: 'date', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pilot-6', name: 'Pilot/SOP #6 PPVT confirmation',
    desc: 'MSIL and vendor-scope PPVT with NG concern breakup.',
    fields: [
      { k: 'ppvt_msil_scope', l: 'PPVT MSIL scope', t: 'yesNo', by: 'PIC', req: true },
      { k: 'ppvt_msil_volume', l: 'PPVT MSIL scope volume', t: 'number', by: 'System', src: 'sap' },
      { k: 'ppvt_msil_status', l: 'PPVT MSIL scope status', t: 'dropdown', o: ['OK', 'NG'], by: 'System', src: 'sap', dash: true },
      { k: 'ppvt_msil_dates', l: 'PPVT MSIL planned / actual date', t: 'text', by: 'System', src: 'sap' },
      { k: 'ppvt_vendor_scope', l: 'PPVT vendor scope', t: 'file', by: 'Vendor', val: true, src: 'upload' },
      { k: 'ppvt_ng', l: 'PPVT NG reason', t: 'table', by: 'Vendor', val: true,
        cols: [
          { key: 'concern_type', label: 'Concern type', type: 'dropdown', options: ['Capacity', 'Quality', 'Both'] },
          { key: 'concern', label: 'Concern', type: 'longText' },
          { key: 'capacity_observed', label: 'Capacity observed', type: 'number' },
          { key: 'shortage_per_day', label: 'Shortage per day', type: 'number' },
          { key: 'rejection_pct', label: 'Rejection %', type: 'number' },
          { key: 'action_plan', label: 'Action plan', type: 'longText' },
          { key: 'target_date', label: 'Target date', type: 'date' }
        ] }
    ]
  }),
  blueprint({
    id: 'pilot-7', name: 'Pilot/SOP #7 PPAP file approval status',
    desc: 'PPAP approval flow from SAP with pending-at tracking.',
    owner: 'PIC',
    fields: [
      { k: 'ppap_status', l: 'PPAP status', t: 'dropdown', o: ['Approved', 'Pending'], by: 'System', src: 'sap', dash: true, list: true },
      { k: 'pending_at', l: 'Pending at', t: 'dropdown', o: ['PIC', 'SIC', 'DPM', 'DDVM', 'DVM', 'DVM-SMC'], by: 'System', src: 'sap' },
      { k: 'target_date', l: 'Target date', t: 'date', by: 'System', src: 'calculated' },
      { k: 'ppap_applicability', l: 'PPAP applicability', t: 'text', by: 'System', src: 'calculated' }
    ]
  }),
  blueprint({
    id: 'pilot-8', name: 'Pilot/SOP #8 Lab testing status',
    desc: 'Testing via LMS with retest log.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'applicable_count', l: 'Applicable count', t: 'number', by: 'System', src: 'calculated' },
      { k: 'testing_planned', l: 'Testing planned count', t: 'number', by: 'PIC' },
      { k: 'lab_request_raised', l: 'Lab request raised count', t: 'number', by: 'PIC' },
      { k: 'sample_submission', l: 'Sample submission', t: 'dropdown', o: ['Submitted', 'Not submitted'], by: 'System', src: 'mapping' },
      { k: 'testing_status', l: 'Testing status', t: 'dropdown', o: ['Under testing', 'OK', 'NG', 'Reference', 'Request rejected'], by: 'System', src: 'mapping', dash: true, list: true },
      { k: 'retest_planned', l: 'Retest planned count', t: 'number', by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pilot-9', name: 'Pilot/SOP #9 Homologation status (camera inspection)',
    desc: 'Camera marking readiness with deviation tracking.',
    fields: [
      { k: 'homologation_applicable', l: 'Homologation applicable', t: 'yesNo', by: 'PIC', req: true },
      { k: 'marking_applicable', l: 'Regulatory marking applicable', t: 'yesNo', by: 'PIC' },
      { k: 'camera_available', l: 'Camera available', t: 'yesNo', by: 'PIC' },
      { k: 'camera_considered', l: 'Camera already considered', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'target_remarks', l: 'Target date + remarks', t: 'date', by: 'Vendor', val: true },
      { k: 'camera_type', l: 'Camera type', t: 'dropdown', o: ['OCR', 'Image'], by: 'Vendor', val: true },
      { k: 'camera_implemented', l: 'Camera implemented', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'deviation_raised', l: 'Deviation raised', t: 'yesNo', by: 'PIC' },
      edocNumber,
      { k: 'edoc_status', l: 'E-Doc approval status', t: 'dropdown', o: ['Approved', 'Under approval', 'Rejected'], by: 'System', src: 'edoc' },
      { k: 'verification_completed', l: 'Verification completed', t: 'yesNo', by: 'PIC' },
      { k: 'delay_reason', l: 'Reason for delay', t: 'dropdown', o: ['SC approval pending', 'SC approved, vendor implementation pending', 'All approvals in, delay by vendor'], by: 'PIC' }
    ]
  }),
  blueprint({
    id: 'pilot-10', name: 'Pilot/SOP #10 List of limit samples for applicable parts',
    desc: 'Limit sample approval with vendor target dates and action plan.',
    fields: [
      { k: 'applicable_parts', l: 'Applicable parts', t: 'yesNo', by: 'PIC', req: true },
      { k: 'applicability_reason', l: 'Reason for limit sample applicability', t: 'longText', by: 'PIC' },
      { k: 'initial_target_date', l: 'Initial target date – start / finish', t: 'date', by: 'Vendor', val: true },
      { k: 'limit_sample_status', l: 'Limit sample status', t: 'dropdown', o: ['Approved', 'Not approved'], by: 'PIC', dash: true, list: true },
      { k: 'not_approved_reason', l: 'Not-approved reason', t: 'dropdown', o: ['Delay in preparation', 'Under preparation', 'Under correction'], by: 'PIC' },
      { k: 'revised_target_date', l: 'Revised target date', t: 'date', by: 'Vendor', val: true },
      { k: 'action_plan', l: 'Action plan', t: 'longText', by: 'Vendor', val: true }
    ]
  }),
  blueprint({
    id: 'pilot-11', name: 'Pilot/SOP #11 IFM mail initiation and checklist completion',
    desc: 'IFM category + mail + checksheet with vendor readiness and 4M action table.',
    fields: [
      { k: 'ifm_category', l: 'IFM category', t: 'dropdown', o: ['A', 'B', 'C', 'D'], by: 'PIC', dash: true },
      { k: 'mail_status', l: 'Mail status', t: 'dropdown', o: ['Mail drafted', 'Mail sent from DVM-san desk'], by: 'PIC' },
      { k: 'checksheet_status', l: 'IFM check sheet status', t: 'dropdown', o: ['Submitted by vendor', 'Approved by MSIL'], by: 'System', src: 'sap' },
      { k: 'ifm_readiness_date', l: 'IFM readiness date', t: 'date', by: 'Vendor', val: true },
      { k: 'ifm_readiness', l: 'IFM readiness', t: 'yesNo', by: 'Vendor', val: true, list: true },
      { k: 'readiness_actions', l: 'If N, readiness actions', t: 'table', by: 'Vendor', val: true,
        cols: [
          { key: 'header', label: 'Category', type: 'dropdown', options: ['Man', 'Material', 'Method', 'Machine'], enteredBy: 'PIC' },
          { key: 'remarks', label: 'Remarks', type: 'longText', enteredBy: 'PIC' },
          { key: 'action_plan', label: 'Action plan', type: 'longText' },
          { key: 'target_date', label: 'Target date', type: 'date' }
        ] }
    ]
  }),
  blueprint({
    id: 'pilot-12', name: 'Pilot/SOP #12 Are you ready? (SOP readiness)',
    desc: 'SOP-readiness form; fields pre-filled from PP/MPP/Pilot; vendor confirms each with remarks/target when NG.',
    fields: [
      { k: 'part_category', l: 'Part category', t: 'dropdown', o: ['A', 'AR', 'A/AR', 'G', 'F'], by: 'System', src: 'sap', list: true },
      { k: 'mail_status', l: 'Mail status', t: 'dropdown', o: ['Mail sent', 'Pending', 'Reply received'], by: 'PIC' },
      { k: 'ppvt', l: 'PPVT', t: 'dropdown', o: ['Closed', 'Pending'], by: 'Vendor', val: true },
      { k: 'tool_readiness', l: 'Tool readiness', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'line_readiness', l: 'Line readiness', t: 'dropdown', o: ['Completed', 'Pending'], by: 'Vendor', val: true },
      { k: 'manpower_total', l: 'Manpower – total', t: 'number', by: 'Vendor', val: true },
      { k: 'manpower_trained_planned', l: 'Manpower – trained planned', t: 'number', by: 'Vendor', val: true },
      { k: 'manpower_trained_actual', l: 'Manpower – trained actual', t: 'number', by: 'Vendor', val: true },
      { k: 'tier2_parts', l: 'Tier-2 – parts confirmation', t: 'dropdown', o: ['OK', 'NG', 'Evaluation pending'], by: 'Vendor', val: true },
      { k: 'tier2_capacity', l: 'Tier-2 – capacity confirmation', t: 'dropdown', o: ['OK', 'NG', 'Evaluation pending'], by: 'Vendor', val: true },
      { k: 'tier2_ifm', l: 'Tier-2 – IFM readiness', t: 'dropdown', o: ['OK', 'NG', 'Evaluation pending'], by: 'Vendor', val: true },
      { k: 'ecn_implementation', l: 'ECN implementation', t: 'dropdown', o: ['Done', 'Pending', 'NA'], by: 'Vendor', val: true },
      { k: 'pre_ecn_disposal', l: 'Pre-ECN parts disposal', t: 'dropdown', o: ['Done', 'Pending'], by: 'Vendor', val: true },
      { k: 'packing', l: 'Packing – sufficient trolleys / bins', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'ifm_station', l: 'Separate IFM station with manpower', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'spare_kit', l: 'Spare kit verification & process audit', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'set_part_drawing', l: 'Set part F-drawing & WIS available', t: 'yesNo', by: 'Vendor', val: true },
      { k: 'ready_check_sheet', l: 'Are-you-ready check sheet', t: 'file', by: 'Vendor', val: true, src: 'upload', req: true }
    ]
  }),
  blueprint({
    id: 'pilot-14', name: 'Pilot/SOP #14 Part updation in Regulatory App',
    desc: 'Upload status to the Regulatory App for homologation parts.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'System', src: 'calculated' },
      { k: 'uploaded_regapp', l: 'Uploaded in Regulatory App', t: 'yesNo', by: 'System', src: 'regapp', dash: true, list: true }
    ]
  }),
  blueprint({
    id: 'pilot-15', name: 'Pilot/SOP #15 Part updation in SMIR system',
    desc: 'SMIR upload status; A/AR/A/AR/F default from SAP, G selected by PIC.',
    fields: [
      { k: 'applicability_aarf', l: 'Applicability – A / AR / A/AR / F', t: 'yesNo', by: 'System', src: 'sap' },
      { k: 'applicability_g', l: 'Applicability – G (selected parts)', t: 'yesNo', by: 'PIC' },
      { k: 'uploaded_smir', l: 'Uploaded in SAP SMIR', t: 'yesNo', by: 'System', src: 'sap', dash: true, list: true }
    ]
  }),
  blueprint({
    id: 'pilot-16', name: 'Pilot/SOP #16 Part updation in CPM Portal',
    desc: 'CPM portal attributes/variables for applicable parts.',
    fields: [
      { k: 'applicability', l: 'Applicability', t: 'yesNo', by: 'PIC', req: true },
      { k: 'part_category', l: 'Part category', t: 'text', by: 'System', src: 'sap' },
      { k: 'attributes', l: 'Attributes', t: 'number', by: 'PIC' },
      { k: 'variables', l: 'Variables', t: 'number', by: 'PIC' }
    ]
  })
]

export const ALL_BLUEPRINTS: ActivityDefinition[] = [
  ...PP_BLUEPRINTS,
  ...MPP_BLUEPRINTS,
  ...PILOT_BLUEPRINTS
]
