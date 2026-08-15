export type EvidenceImportance = 'primary' | 'secondary' | 'technical';

export type EvidenceSource = 'seller_declared' | 'platform_data' | 'service_result';

export interface EvidenceItem {
  key: string;
  label: string;
  value: string;
  importance: EvidenceImportance;
  source: EvidenceSource;
}

export interface EvidenceGroup {
  title: string;
  summary?: string;
  items: EvidenceItem[];
}

export type EvidenceCategory =
  | 'fashion'
  | 'bags_accessories'
  | 'watches_jewellery'
  | 'electronics'
  | 'art_collectibles'
  | 'cars'
  | 'yachts'
  | 'fallback';

interface CategoryInput {
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
  description?: string | null;
  material?: string | null;
  measurements?: string | null;
  flaws?: string | null;
  reference?: string | null;
  movement?: string | null;
  caseSize?: string | null;
  serviceHistory?: string | null;
  boxPapers?: string | null;
  dimensions?: string | null;
  hardware?: string | null;
  exteriorCondition?: string | null;
  interiorCondition?: string | null;
  includedAccessories?: string | null;
  serialImagery?: string | null;
  provenance?: string | null;
  model?: string | null;
  storage?: string | null;
  batteryCondition?: string | null;
  functionalIssues?: string | null;
  warranty?: string | null;
  creator?: string | null;
  year?: string | null;
  medium?: string | null;
  edition?: string | null;
  // ── Cars ──
  make?: string | null;
  mileage?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  bodyType?: string | null;
  serviceRecords?: string | null;
  motInspection?: string | null;
  mechanicalCondition?: string | null;
  inspectionAvailable?: string | null;
  inspectionReport?: string | null;
  v5Logbook?: string | null;
  numberOfOwners?: string | null;
  financeStatus?: string | null;
  // ── Yachts ──
  length?: string | null;
  beam?: string | null;
  draft?: string | null;
  displacement?: string | null;
  engineType?: string | null;
  engineHours?: string | null;
  surveyAvailable?: string | null;
  surveyDate?: string | null;
  surveyReport?: string | null;
  registration?: string | null;
  flag?: string | null;
  ownershipDocs?: string | null;
  viewingAvailable?: string | null;
  viewingLocation?: string | null;
  seaTrialAvailable?: string | null;
}

const CATEGORY_ALIASES: Record<string, EvidenceCategory> = {
  women: 'fashion',
  men: 'fashion',
  clothing: 'fashion',
  shoes: 'fashion',
  footwear: 'fashion',
  sneakers: 'fashion',
  bags: 'bags_accessories',
  bag: 'bags_accessories',
  accessories: 'bags_accessories',
  accessory: 'bags_accessories',
  handbags: 'bags_accessories',
  watches: 'watches_jewellery',
  watch: 'watches_jewellery',
  jewellery: 'watches_jewellery',
  jewelry: 'watches_jewellery',
  rings: 'watches_jewellery',
  necklaces: 'watches_jewellery',
  electronics: 'electronics',
  tech: 'electronics',
  phones: 'electronics',
  laptops: 'electronics',
  audio: 'electronics',
  cameras: 'electronics',
  art: 'art_collectibles',
  collectibles: 'art_collectibles',
  collectible: 'art_collectibles',
  prints: 'art_collectibles',
  vinyl: 'art_collectibles',
  toys: 'art_collectibles',
  // Cars
  cars: 'cars',
  car: 'cars',
  vehicles: 'cars',
  vehicle: 'cars',
  automobile: 'cars',
  // Yachts
  yachts: 'yachts',
  yacht: 'yachts',
  boats: 'yachts',
  boat: 'yachts',
  vessel: 'yachts',
};

export function resolveEvidenceCategory(
  category?: string | null,
  subcategory?: string | null,
): EvidenceCategory {
  const candidates = [subcategory, category].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().trim();
    if (CATEGORY_ALIASES[normalized]) {
      return CATEGORY_ALIASES[normalized];
    }
    for (const [alias, resolved] of Object.entries(CATEGORY_ALIASES)) {
      if (normalized.includes(alias)) {
        return resolved;
      }
    }
  }
  return 'fallback';
}

function buildEvidenceItem(
  key: string,
  label: string,
  value: string | null | undefined,
  importance: EvidenceImportance,
  source: EvidenceSource = 'seller_declared',
): EvidenceItem | null {
  if (!value || value.trim() === '') return null;
  return { key, label, value: value.trim(), importance, source };
}

export function resolveEvidenceGroups(input: CategoryInput): EvidenceGroup[] {
  const categoryType = resolveEvidenceCategory(input.category, input.subcategory);
  const groups: EvidenceGroup[] = [];

  switch (categoryType) {
    case 'fashion': {
      const primary: EvidenceItem[] = [];
      const sizeItem = buildEvidenceItem('size', 'Size', input.size, 'primary');
      const conditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      if (sizeItem) primary.push(sizeItem);
      if (conditionItem) primary.push(conditionItem);

      const secondary: EvidenceItem[] = [];
      const materialItem = buildEvidenceItem('material', 'Material', input.material, 'secondary');
      if (materialItem) secondary.push(materialItem);

      const technical: EvidenceItem[] = [];
      const measurementsItem = buildEvidenceItem('measurements', 'Measurements', input.measurements, 'technical');
      const flawsItem = buildEvidenceItem('flaws', 'Declared flaws', input.flaws, 'technical');
      if (measurementsItem) technical.push(measurementsItem);
      if (flawsItem) technical.push(flawsItem);

      if (primary.length > 0) {
        groups.push({
          title: 'Key details',
          summary: primary.map((i) => i.value).join(' · '),
          items: primary,
        });
      }
      if (secondary.length > 0) {
        groups.push({ title: 'Material', items: secondary });
      }
      if (technical.length > 0) {
        groups.push({ title: 'Seller notes', items: technical });
      }
      break;
    }

    case 'bags_accessories': {
      const primary: EvidenceItem[] = [];
      const conditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      if (conditionItem) primary.push(conditionItem);

      const secondary: EvidenceItem[] = [];
      const dimensionsItem = buildEvidenceItem('dimensions', 'Dimensions', input.dimensions, 'secondary');
      const materialItem = buildEvidenceItem('material', 'Material', input.material, 'secondary');
      const hardwareItem = buildEvidenceItem('hardware', 'Hardware', input.hardware, 'secondary');
      if (dimensionsItem) secondary.push(dimensionsItem);
      if (materialItem) secondary.push(materialItem);
      if (hardwareItem) secondary.push(hardwareItem);

      const technical: EvidenceItem[] = [];
      const exteriorItem = buildEvidenceItem('exteriorCondition', 'Exterior condition', input.exteriorCondition, 'technical');
      const interiorItem = buildEvidenceItem('interiorCondition', 'Interior condition', input.interiorCondition, 'technical');
      const accessoriesItem = buildEvidenceItem('includedAccessories', 'Included accessories', input.includedAccessories, 'technical');
      const serialItem = buildEvidenceItem('serialImagery', 'Serial/date code imagery', input.serialImagery, 'technical');
      const provenanceItem = buildEvidenceItem('provenance', 'Seller-declared provenance', input.provenance, 'technical');
      if (exteriorItem) technical.push(exteriorItem);
      if (interiorItem) technical.push(interiorItem);
      if (accessoriesItem) technical.push(accessoriesItem);
      if (serialItem) technical.push(serialItem);
      if (provenanceItem) technical.push(provenanceItem);

      if (primary.length > 0) {
        groups.push({
          title: 'Key details',
          summary: primary.map((i) => i.value).join(' · '),
          items: primary,
        });
      }
      if (secondary.length > 0) {
        groups.push({ title: 'Construction', items: secondary });
      }
      if (technical.length > 0) {
        groups.push({ title: 'Condition & provenance', items: technical });
      }
      break;
    }

    case 'watches_jewellery': {
      const primary: EvidenceItem[] = [];
      const referenceItem = buildEvidenceItem('reference', 'Reference', input.reference, 'primary');
      const conditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      if (referenceItem) primary.push(referenceItem);
      if (conditionItem) primary.push(conditionItem);

      const secondary: EvidenceItem[] = [];
      const movementItem = buildEvidenceItem('movement', 'Movement', input.movement, 'secondary');
      const caseSizeItem = buildEvidenceItem('caseSize', 'Case size', input.caseSize, 'secondary');
      const materialItem = buildEvidenceItem('material', 'Material', input.material, 'secondary');
      if (movementItem) secondary.push(movementItem);
      if (caseSizeItem) secondary.push(caseSizeItem);
      if (materialItem) secondary.push(materialItem);

      const technical: EvidenceItem[] = [];
      const serviceItem = buildEvidenceItem('serviceHistory', 'Service history', input.serviceHistory, 'technical');
      const boxPapersItem = buildEvidenceItem('boxPapers', 'Box & papers', input.boxPapers, 'technical');
      if (serviceItem) technical.push(serviceItem);
      if (boxPapersItem) technical.push(boxPapersItem);

      if (primary.length > 0) {
        groups.push({
          title: 'Key details',
          summary: primary.map((i) => i.value).join(' · '),
          items: primary,
        });
      }
      if (secondary.length > 0) {
        groups.push({ title: 'Specification', items: secondary });
      }
      if (technical.length > 0) {
        groups.push({ title: 'Service & accessories', items: technical });
      }
      break;
    }

    case 'electronics': {
      const primary: EvidenceItem[] = [];
      const modelItem = buildEvidenceItem('model', 'Model', input.model ?? input.brand, 'primary');
      const conditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      if (modelItem) primary.push(modelItem);
      if (conditionItem) primary.push(conditionItem);

      const secondary: EvidenceItem[] = [];
      const storageItem = buildEvidenceItem('storage', 'Storage / Spec', input.storage, 'secondary');
      const batteryItem = buildEvidenceItem('batteryCondition', 'Battery condition', input.batteryCondition, 'secondary');
      if (storageItem) secondary.push(storageItem);
      if (batteryItem) secondary.push(batteryItem);

      const technical: EvidenceItem[] = [];
      const accessoriesItem = buildEvidenceItem('includedAccessories', 'Included accessories', input.includedAccessories, 'technical');
      const issuesItem = buildEvidenceItem('functionalIssues', 'Functional issues', input.functionalIssues, 'technical');
      const warrantyItem = buildEvidenceItem('warranty', 'Warranty', input.warranty, 'technical');
      if (accessoriesItem) technical.push(accessoriesItem);
      if (issuesItem) technical.push(issuesItem);
      if (warrantyItem) technical.push(warrantyItem);

      if (primary.length > 0) {
        groups.push({
          title: 'Key details',
          summary: primary.map((i) => i.value).join(' · '),
          items: primary,
        });
      }
      if (secondary.length > 0) {
        groups.push({ title: 'Specification', items: secondary });
      }
      if (technical.length > 0) {
        groups.push({ title: 'Condition & warranty', items: technical });
      }
      break;
    }

    case 'art_collectibles': {
      const primary: EvidenceItem[] = [];
      const creatorItem = buildEvidenceItem('creator', 'Creator', input.creator ?? input.brand, 'primary');
      const conditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      if (creatorItem) primary.push(creatorItem);
      if (conditionItem) primary.push(conditionItem);

      const secondary: EvidenceItem[] = [];
      const yearItem = buildEvidenceItem('year', 'Year', input.year, 'secondary');
      const mediumItem = buildEvidenceItem('medium', 'Medium', input.medium, 'secondary');
      const editionItem = buildEvidenceItem('edition', 'Edition', input.edition, 'secondary');
      const dimensionsItem = buildEvidenceItem('dimensions', 'Dimensions', input.dimensions, 'secondary');
      if (yearItem) secondary.push(yearItem);
      if (mediumItem) secondary.push(mediumItem);
      if (editionItem) secondary.push(editionItem);
      if (dimensionsItem) secondary.push(dimensionsItem);

      const technical: EvidenceItem[] = [];
      const provenanceItem = buildEvidenceItem('provenance', 'Seller-declared provenance', input.provenance, 'technical');
      if (provenanceItem) technical.push(provenanceItem);

      if (primary.length > 0) {
        groups.push({
          title: 'Key details',
          summary: primary.map((i) => i.value).join(' · '),
          items: primary,
        });
      }
      if (secondary.length > 0) {
        groups.push({ title: 'Specification', items: secondary });
      }
      if (technical.length > 0) {
        groups.push({ title: 'Provenance', items: technical });
      }
      break;
    }

    case 'cars': {
      // Vehicle spec
      const specItems: EvidenceItem[] = [];
      const makeItem = buildEvidenceItem('make', 'Make', input.make ?? input.brand, 'primary');
      const modelItem = buildEvidenceItem('model', 'Model', input.model, 'primary');
      const yearItem = buildEvidenceItem('year', 'Year', input.year, 'primary');
      const mileageItem = buildEvidenceItem('mileage', 'Mileage', input.mileage, 'primary');
      const transmissionItem = buildEvidenceItem('transmission', 'Transmission', input.transmission, 'secondary');
      const fuelTypeItem = buildEvidenceItem('fuelType', 'Fuel type', input.fuelType, 'secondary');
      const bodyTypeItem = buildEvidenceItem('bodyType', 'Body type', input.bodyType, 'secondary');
      if (makeItem) specItems.push(makeItem);
      if (modelItem) specItems.push(modelItem);
      if (yearItem) specItems.push(yearItem);
      if (mileageItem) specItems.push(mileageItem);
      if (transmissionItem) specItems.push(transmissionItem);
      if (fuelTypeItem) specItems.push(fuelTypeItem);
      if (bodyTypeItem) specItems.push(bodyTypeItem);

      // Service history
      const serviceItems: EvidenceItem[] = [];
      const serviceRecordsItem = buildEvidenceItem('serviceRecords', 'Service records', input.serviceRecords, 'secondary');
      const motItem = buildEvidenceItem('motInspection', 'MOT / Inspection', input.motInspection, 'secondary');
      const serviceHistoryItem = buildEvidenceItem('serviceHistory', 'Service history', input.serviceHistory, 'secondary');
      if (serviceRecordsItem) serviceItems.push(serviceRecordsItem);
      if (motItem) serviceItems.push(motItem);
      if (serviceHistoryItem) serviceItems.push(serviceHistoryItem);

      // Condition
      const conditionItems: EvidenceItem[] = [];
      const exteriorItem = buildEvidenceItem('exteriorCondition', 'Exterior condition', input.exteriorCondition, 'secondary');
      const interiorItem = buildEvidenceItem('interiorCondition', 'Interior condition', input.interiorCondition, 'secondary');
      const mechanicalItem = buildEvidenceItem('mechanicalCondition', 'Mechanical condition', input.mechanicalCondition, 'secondary');
      const generalConditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      if (generalConditionItem) conditionItems.push(generalConditionItem);
      if (exteriorItem) conditionItems.push(exteriorItem);
      if (interiorItem) conditionItems.push(interiorItem);
      if (mechanicalItem) conditionItems.push(mechanicalItem);

      // Inspection
      const inspectionItems: EvidenceItem[] = [];
      const inspectionAvailableItem = buildEvidenceItem('inspectionAvailable', 'Inspection available', input.inspectionAvailable, 'technical');
      const inspectionReportItem = buildEvidenceItem('inspectionReport', 'Inspection report', input.inspectionReport, 'technical');
      if (inspectionAvailableItem) inspectionItems.push(inspectionAvailableItem);
      if (inspectionReportItem) inspectionItems.push(inspectionReportItem);

      // Ownership
      const ownershipItems: EvidenceItem[] = [];
      const v5Item = buildEvidenceItem('v5Logbook', 'V5 / Logbook', input.v5Logbook, 'technical');
      const ownersItem = buildEvidenceItem('numberOfOwners', 'Number of owners', input.numberOfOwners, 'technical');
      const financeItem = buildEvidenceItem('financeStatus', 'Finance status', input.financeStatus, 'technical');
      if (v5Item) ownershipItems.push(v5Item);
      if (ownersItem) ownershipItems.push(ownersItem);
      if (financeItem) ownershipItems.push(financeItem);

      if (specItems.length > 0) {
        groups.push({
          title: 'Vehicle specification',
          summary: specItems.map((i) => i.value).join(' · '),
          items: specItems,
        });
      }
      if (serviceItems.length > 0) {
        groups.push({ title: 'Service history', items: serviceItems });
      }
      if (conditionItems.length > 0) {
        groups.push({ title: 'Condition', items: conditionItems });
      }
      if (inspectionItems.length > 0) {
        groups.push({ title: 'Inspection', items: inspectionItems });
      }
      if (ownershipItems.length > 0) {
        groups.push({ title: 'Ownership', items: ownershipItems });
      }
      break;
    }

    case 'yachts': {
      // Vessel spec
      const specItems: EvidenceItem[] = [];
      const makeItem = buildEvidenceItem('make', 'Make', input.make ?? input.brand, 'primary');
      const modelItem = buildEvidenceItem('model', 'Model', input.model, 'primary');
      const yearItem = buildEvidenceItem('year', 'Year', input.year, 'primary');
      const lengthItem = buildEvidenceItem('length', 'Length', input.length, 'primary');
      const beamItem = buildEvidenceItem('beam', 'Beam', input.beam, 'secondary');
      const draftItem = buildEvidenceItem('draft', 'Draft', input.draft, 'secondary');
      const displacementItem = buildEvidenceItem('displacement', 'Displacement', input.displacement, 'secondary');
      if (makeItem) specItems.push(makeItem);
      if (modelItem) specItems.push(modelItem);
      if (yearItem) specItems.push(yearItem);
      if (lengthItem) specItems.push(lengthItem);
      if (beamItem) specItems.push(beamItem);
      if (draftItem) specItems.push(draftItem);
      if (displacementItem) specItems.push(displacementItem);

      // Engine
      const engineItems: EvidenceItem[] = [];
      const engineTypeItem = buildEvidenceItem('engineType', 'Engine type', input.engineType, 'secondary');
      const engineHoursItem = buildEvidenceItem('engineHours', 'Engine hours', input.engineHours, 'secondary');
      const engineServiceItem = buildEvidenceItem('serviceHistory', 'Service history', input.serviceHistory, 'secondary');
      if (engineTypeItem) engineItems.push(engineTypeItem);
      if (engineHoursItem) engineItems.push(engineHoursItem);
      if (engineServiceItem) engineItems.push(engineServiceItem);

      // Survey
      const surveyItems: EvidenceItem[] = [];
      const surveyAvailableItem = buildEvidenceItem('surveyAvailable', 'Survey available', input.surveyAvailable, 'technical');
      const surveyDateItem = buildEvidenceItem('surveyDate', 'Survey date', input.surveyDate, 'technical');
      const surveyReportItem = buildEvidenceItem('surveyReport', 'Survey report', input.surveyReport, 'technical');
      if (surveyAvailableItem) surveyItems.push(surveyAvailableItem);
      if (surveyDateItem) surveyItems.push(surveyDateItem);
      if (surveyReportItem) surveyItems.push(surveyReportItem);

      // Documentation
      const docItems: EvidenceItem[] = [];
      const registrationItem = buildEvidenceItem('registration', 'Registration', input.registration, 'technical');
      const flagItem = buildEvidenceItem('flag', 'Flag', input.flag, 'technical');
      const ownershipDocsItem = buildEvidenceItem('ownershipDocs', 'Ownership docs', input.ownershipDocs, 'technical');
      if (registrationItem) docItems.push(registrationItem);
      if (flagItem) docItems.push(flagItem);
      if (ownershipDocsItem) docItems.push(ownershipDocsItem);

      // Viewing
      const viewingItems: EvidenceItem[] = [];
      const viewingAvailableItem = buildEvidenceItem('viewingAvailable', 'Viewing available', input.viewingAvailable, 'technical');
      const viewingLocationItem = buildEvidenceItem('viewingLocation', 'Viewing location', input.viewingLocation, 'technical');
      const seaTrialItem = buildEvidenceItem('seaTrialAvailable', 'Sea trial available', input.seaTrialAvailable, 'technical');
      if (viewingAvailableItem) viewingItems.push(viewingAvailableItem);
      if (viewingLocationItem) viewingItems.push(viewingLocationItem);
      if (seaTrialItem) viewingItems.push(seaTrialItem);

      if (specItems.length > 0) {
        groups.push({
          title: 'Vessel specification',
          summary: specItems.map((i) => i.value).join(' · '),
          items: specItems,
        });
      }
      if (engineItems.length > 0) {
        groups.push({ title: 'Engine', items: engineItems });
      }
      if (surveyItems.length > 0) {
        groups.push({ title: 'Survey', items: surveyItems });
      }
      if (docItems.length > 0) {
        groups.push({ title: 'Documentation', items: docItems });
      }
      if (viewingItems.length > 0) {
        groups.push({ title: 'Viewing', items: viewingItems });
      }
      break;
    }

    case 'fallback':
    default: {
      const primary: EvidenceItem[] = [];
      const conditionItem = buildEvidenceItem('condition', 'Condition', input.condition, 'primary');
      const categoryItem = buildEvidenceItem('category', 'Category', input.category, 'primary');
      if (conditionItem) primary.push(conditionItem);
      if (categoryItem) primary.push(categoryItem);

      const secondary: EvidenceItem[] = [];
      const descriptionItem = buildEvidenceItem('description', 'Seller description', input.description, 'secondary');
      if (descriptionItem) secondary.push(descriptionItem);

      if (primary.length > 0) {
        groups.push({
          title: 'Key details',
          summary: primary.map((i) => i.value).join(' · '),
          items: primary,
        });
      }
      if (secondary.length > 0) {
        groups.push({ title: 'Seller notes', items: secondary });
      }
      break;
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

export function hasEvidence(input: CategoryInput): boolean {
  return resolveEvidenceGroups(input).length > 0;
}
