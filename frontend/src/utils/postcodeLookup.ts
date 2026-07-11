/**
 * UK postcode prefix → city/region mapping.
 *
 * This is a lightweight client-side lookup that auto-fills city and region
 * based on the first half of a UK postcode (the "outcode").
 *
 * It covers the major postcode areas and is intentionally not exhaustive —
 * it's a convenience that saves typing for the most common cases. The user
 * can always manually override the suggested city/region.
 */

interface PostcodeArea {
  /** Postcode area prefix (e.g., "SW", "M", "B") */
  prefix: string;
  /** Primary city for this area */
  city: string;
  /** Region/county */
  region: string;
}

const UK_POSTCODE_AREAS: PostcodeArea[] = [
  // London
  { prefix: 'SW', city: 'London', region: 'Greater London' },
  { prefix: 'SE', city: 'London', region: 'Greater London' },
  { prefix: 'NW', city: 'London', region: 'Greater London' },
  { prefix: 'NE', city: 'London', region: 'Greater London' },
  { prefix: 'N', city: 'London', region: 'Greater London' },
  { prefix: 'E', city: 'London', region: 'Greater London' },
  { prefix: 'W', city: 'London', region: 'Greater London' },
  { prefix: 'EC', city: 'London', region: 'Greater London' },
  { prefix: 'WC', city: 'London', region: 'Greater London' },
  // Major cities
  { prefix: 'M', city: 'Manchester', region: 'Greater Manchester' },
  { prefix: 'B', city: 'Birmingham', region: 'West Midlands' },
  { prefix: 'L', city: 'Liverpool', region: 'Merseyside' },
  { prefix: 'LS', city: 'Leeds', region: 'West Yorkshire' },
  { prefix: 'G', city: 'Glasgow', region: 'Glasgow City' },
  { prefix: 'EH', city: 'Edinburgh', region: 'City of Edinburgh' },
  { prefix: 'CF', city: 'Cardiff', region: 'Cardiff' },
  { prefix: 'BT', city: 'Belfast', region: 'Belfast' },
  { prefix: 'CB', city: 'Cambridge', region: 'Cambridgeshire' },
  { prefix: 'OX', city: 'Oxford', region: 'Oxfordshire' },
  { prefix: 'CB', city: 'Cambridge', region: 'Cambridgeshire' },
  { prefix: 'NG', city: 'Nottingham', region: 'Nottinghamshire' },
  { prefix: 'LE', city: 'Leicester', region: 'Leicestershire' },
  { prefix: 'SK', city: 'Stockport', region: 'Greater Manchester' },
  { prefix: 'PR', city: 'Preston', region: 'Lancashire' },
  { prefix: 'BL', city: 'Bolton', region: 'Greater Manchester' },
  { prefix: 'OL', city: 'Oldham', region: 'Greater Manchester' },
  { prefix: 'WN', city: 'Wigan', region: 'Greater Manchester' },
  { prefix: 'CV', city: 'Coventry', region: 'West Midlands' },
  { prefix: 'DY', city: 'Dudley', region: 'West Midlands' },
  { prefix: 'WV', city: 'Wolverhampton', region: 'West Midlands' },
  { prefix: 'S', city: 'Sheffield', region: 'South Yorkshire' },
  { prefix: 'BD', city: 'Bradford', region: 'West Yorkshire' },
  { prefix: 'HD', city: 'Huddersfield', region: 'West Yorkshire' },
  { prefix: 'HX', city: 'Halifax', region: 'West Yorkshire' },
  { prefix: 'DE', city: 'Derby', region: 'Derbyshire' },
  { prefix: 'NN', city: 'Northampton', region: 'Northamptonshire' },
  { prefix: 'MK', city: 'Milton Keynes', region: 'Buckinghamshire' },
  { prefix: 'LU', city: 'Luton', region: 'Bedfordshire' },
  { prefix: 'SG', city: 'Stevenage', region: 'Hertfordshire' },
  { prefix: 'AL', city: 'St Albans', region: 'Hertfordshire' },
  { prefix: 'HP', city: 'High Wycombe', region: 'Buckinghamshire' },
  { prefix: 'SL', city: 'Slough', region: 'Berkshire' },
  { prefix: 'RG', city: 'Reading', region: 'Berkshire' },
  { prefix: 'GU', city: 'Guildford', region: 'Surrey' },
  { prefix: 'KT', city: 'Kingston upon Thames', region: 'Greater London' },
  { prefix: 'CR', city: 'Croydon', region: 'Greater London' },
  { prefix: 'BR', city: 'Bromley', region: 'Greater London' },
  { prefix: 'DA', city: 'Dartford', region: 'Kent' },
  { prefix: 'TN', city: 'Tunbridge Wells', region: 'Kent' },
  { prefix: 'CT', city: 'Canterbury', region: 'Kent' },
  { prefix: 'ME', city: 'Medway', region: 'Kent' },
  { prefix: 'BN', city: 'Brighton', region: 'East Sussex' },
  { prefix: 'RH', city: 'Redhill', region: 'Surrey' },
  { prefix: 'PO', city: 'Portsmouth', region: 'Hampshire' },
  { prefix: 'SO', city: 'Southampton', region: 'Hampshire' },
  { prefix: 'BH', city: 'Bournemouth', region: 'Dorset' },
  { prefix: 'DT', city: 'Dorchester', region: 'Dorset' },
  { prefix: 'EX', city: 'Exeter', region: 'Devon' },
  { prefix: 'PL', city: 'Plymouth', region: 'Devon' },
  { prefix: 'TQ', city: 'Torquay', region: 'Devon' },
  { prefix: 'TR', city: 'Truro', region: 'Cornwall' },
  { prefix: 'BA', city: 'Bath', region: 'Somerset' },
  { prefix: 'BS', city: 'Bristol', region: 'Bristol' },
  { prefix: 'SN', city: 'Swindon', region: 'Wiltshire' },
  { prefix: 'SP', city: 'Salisbury', region: 'Wiltshire' },
  { prefix: 'GL', city: 'Gloucester', region: 'Gloucestershire' },
  { prefix: 'HR', city: 'Hereford', region: 'Herefordshire' },
  { prefix: 'WR', city: 'Worcester', region: 'Worcestershire' },
  { prefix: 'DY', city: 'Dudley', region: 'West Midlands' },
  { prefix: 'ST', city: 'Stoke-on-Trent', region: 'Staffordshire' },
  { prefix: 'WS', city: 'Walsall', region: 'West Midlands' },
  { prefix: 'TF', city: 'Telford', region: 'Shropshire' },
  { prefix: 'SY', city: 'Shrewsbury', region: 'Shropshire' },
  { prefix: 'CH', city: 'Chester', region: 'Cheshire' },
  { prefix: 'WA', city: 'Warrington', region: 'Cheshire' },
  { prefix: 'CW', city: 'Crewe', region: 'Cheshire' },
  { prefix: 'L', city: 'Liverpool', region: 'Merseyside' },
  { prefix: 'CH', city: 'Chester', region: 'Cheshire' },
  { prefix: 'CA', city: 'Carlisle', region: 'Cumbria' },
  { prefix: 'LA', city: 'Lancaster', region: 'Lancashire' },
  { prefix: 'BB', city: 'Blackburn', region: 'Lancashire' },
  { prefix: 'FY', city: 'Blackpool', region: 'Lancashire' },
  { prefix: 'HX', city: 'Halifax', region: 'West Yorkshire' },
  { prefix: 'HG', city: 'Harrogate', region: 'North Yorkshire' },
  { prefix: 'YO', city: 'York', region: 'North Yorkshire' },
  { prefix: 'DL', city: 'Darlington', region: 'County Durham' },
  { prefix: 'DH', city: 'Durham', region: 'County Durham' },
  { prefix: 'SR', city: 'Sunderland', region: 'Tyne and Wear' },
  { prefix: 'NE', city: 'Newcastle upon Tyne', region: 'Tyne and Wear' },
  { prefix: 'TS', city: 'Middlesbrough', region: 'North Yorkshire' },
  { prefix: 'FK', city: 'Falkirk', region: 'Falkirk' },
  { prefix: 'PA', city: 'Paisley', region: 'Renfrewshire' },
  { prefix: 'AB', city: 'Aberdeen', region: 'Aberdeen City' },
  { prefix: 'DD', city: 'Dundee', region: 'Dundee City' },
  { prefix: 'IV', city: 'Inverness', region: 'Highland' },
  { prefix: 'KW', city: 'Kirkwall', region: 'Orkney Islands' },
  { prefix: 'ZE', city: 'Lerwick', region: 'Shetland Islands' },
  { prefix: 'HS', city: 'Stornoway', region: 'Na h-Eileanan Siar' },
  { prefix: 'PH', city: 'Perth', region: 'Perth and Kinross' },
];

/**
 * Extracts the postcode area (letters at the start) from a UK postcode.
 * e.g., "SW1A 1AA" → "SW", "M1 2AB" → "M"
 */
function extractPostcodeArea(postcode: string): string | null {
  const trimmed = postcode.trim().toUpperCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^([A-Z]+)/);
  return match ? match[1] : null;
}

export interface PostcodeLookupResult {
  city: string;
  region: string;
}

/**
 * Looks up a UK postcode and returns the suggested city and region.
 * Returns null if no match is found or the postcode is not a UK format.
 */
export function lookupUKPostcode(postcode: string): PostcodeLookupResult | null {
  const area = extractPostcodeArea(postcode);
  if (!area) return null;

  // Find the longest matching prefix (e.g., "SW" matches before "S")
  const match = UK_POSTCODE_AREAS
    .filter((a) => area.startsWith(a.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  if (!match) return null;

  return {
    city: match.city,
    region: match.region,
  };
}

/**
 * Determines if a postcode looks like a UK postcode.
 * Used to decide whether to attempt UK lookup.
 */
export function isUKPostcode(postcode: string): boolean {
  const trimmed = postcode.trim().toUpperCase();
  // UK postcode format: letters + digits, optional space, digits + letters
  return /^[A-Z]{1,2}[0-9]/.test(trimmed);
}
