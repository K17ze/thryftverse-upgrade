/**
 * Connector Registry — runtime gate for catalogue sources.
 *
 * The registry is the single place that decides which sources the rest of the
 * system may talk to. A source is only connectable when its capability is
 * registered here AND `enabled` is true. Partnership-gated adapters are not
 * registered merely because a file exists (per blueprint §8).
 */

import type {
  CatalogSource,
} from '../../domain/catalogImports/catalogImportTypes.js';
import type {
  CatalogSourceConnector,
  ConnectorRegistry,
  SellerPackageConnector,
  SourceCapability,
} from './connector.js';
import { SellerPackageConnectorImpl } from './sellerPackageConnector.js';

class ConnectorRegistryImpl implements ConnectorRegistry {
  private readonly connectors = new Map<CatalogSource, CatalogSourceConnector>();
  private readonly sellerPackageConnectors = new Map<CatalogSource, SellerPackageConnector>();
  private readonly capabilities = new Map<CatalogSource, SourceCapability>();

  registerConnector(connector: CatalogSourceConnector): void {
    this.connectors.set(connector.source, connector);
    this.capabilities.set(connector.source, connector.capability);
  }

  registerSellerPackageConnector(connector: SellerPackageConnector): void {
    this.sellerPackageConnectors.set(connector.source, connector);
    this.capabilities.set(connector.source, connector.capability);
  }

  /**
   * Register a capability without a connector instance. Used for sources that
   * are visible in the /sources endpoint but not yet connectable (disabled,
   * pending partnership, or pending legal approval).
   */
  registerCapability(capability: SourceCapability): void {
    this.capabilities.set(capability.source, capability);
  }

  listCapabilities(): SourceCapability[] {
    return Array.from(this.capabilities.values());
  }

  getCapability(source: CatalogSource): SourceCapability | undefined {
    return this.capabilities.get(source);
  }

  getConnector(source: CatalogSource): CatalogSourceConnector | undefined {
    return this.connectors.get(source);
  }

  getSellerPackageConnector(source: CatalogSource): SellerPackageConnector | undefined {
    return this.sellerPackageConnectors.get(source);
  }

  isAvailable(source: CatalogSource): boolean {
    const capability = this.capabilities.get(source);
    if (!capability) {
      return false;
    }
    return capability.enabled;
  }
}

export function createConnectorRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistryImpl();

  // Seller-package upload is the launch wedge: no OAuth, no scraping.
  const sellerPackageCapability: SourceCapability = {
    source: 'seller_package',
    authorization: 'seller_upload',
    canReadInventory: true,
    canReadMedia: true,
    canReadVariations: false,
    supportsIncrementalCursor: false,
    supportsRevocation: true,
    legalApprovalVersion: '1.0.0',
    enabled: true,
    unavailableReason: null,
  };

  // eBay — pending production keys.
  const ebayCapability: SourceCapability = {
    source: 'ebay',
    authorization: 'oauth',
    canReadInventory: true,
    canReadMedia: true,
    canReadVariations: true,
    supportsIncrementalCursor: true,
    supportsRevocation: true,
    legalApprovalVersion: '1.0.0',
    enabled: false,
    unavailableReason: 'Coming soon — pending production keys',
  };

  // Depop — pilot access only.
  const depopCapability: SourceCapability = {
    source: 'depop',
    authorization: 'oauth',
    canReadInventory: true,
    canReadMedia: true,
    canReadVariations: false,
    supportsIncrementalCursor: true,
    supportsRevocation: true,
    legalApprovalVersion: '1.0.0',
    enabled: false,
    unavailableReason: 'Pilot — request access',
  };

  // Vinted — partnership required. Vinted Pro Integrations uses HMAC-SHA256
  // request signing (access key + signing key), not OAuth 2.0.
  const vintedCapability: SourceCapability = {
    source: 'vinted',
    authorization: 'partner_key',
    canReadInventory: true,
    canReadMedia: true,
    canReadVariations: false,
    supportsIncrementalCursor: true,
    supportsRevocation: false,
    legalApprovalVersion: '1.0.0',
    enabled: false,
    unavailableReason: 'Partnership required',
  };

  // Etsy is intentionally NOT registered — legal blocker.

  const sellerPackageConnector = new SellerPackageConnectorImpl(sellerPackageCapability);
  registry.registerSellerPackageConnector(sellerPackageConnector);

  // Register disabled capabilities so the /sources endpoint can surface them
  // with their unavailable reasons, without exposing a connector instance.
  registry.registerCapability(ebayCapability);
  registry.registerCapability(depopCapability);
  registry.registerCapability(vintedCapability);

  return registry;
}

export const connectorRegistry: ConnectorRegistry = createConnectorRegistry();
