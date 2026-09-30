'use client';

/**
 * CollectionSheetsGroup — modal sheets for collection detail:
 * Import candidates sheet, Options menu sheet, Cover photo picker sheet,
 * Edit metadata sheet, and Delete confirmation sheet.
 */

import { CollectionImportSheet } from '@/components/collections/CollectionImportSheet';
import { EditCollectionSheet } from '@/components/collections/EditCollectionSheet';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { getListingCoverUri } from '@/lib/utils/media';

interface CollectionSheetsGroupProps {
  id: string;
  title: string;
  isPrivate?: boolean;
  archived?: boolean;
  isCloset: boolean;

  importOpen: boolean;
  onCloseImport: () => void;
  candidates: DiscoveryListingSummary[];
  onAddItems: (ids: string[]) => void;

  optionsOpen: boolean;
  onCloseOptions: () => void;
  onOpenDetails: () => void;
  onStartEditing: () => void;
  onOpenCover: () => void;
  onTogglePrivacy: () => void;
  onToggleArchive: () => void;
  onShare: () => void;
  onOpenConfirmDelete: () => void;

  coverOpen: boolean;
  onCloseCover: () => void;
  items: DiscoveryListingSummary[];
  coverItemId?: string;
  onSelectCover: (itemId: string | null) => void;

  detailsOpen: boolean;
  onCloseDetails: () => void;
  initialDetails: {
    title: string;
    description: string | null;
    isPrivate: boolean;
  };
  onSaveDetails: (next: {
    title: string;
    description: string | null;
    isPrivate: boolean;
  }) => Promise<void>;

  confirmDelete: boolean;
  onCloseConfirmDelete: () => void;
  onDeleteCollection: () => void;
}

export function CollectionSheetsGroup({
  id,
  title,
  isPrivate,
  archived,
  isCloset,
  importOpen,
  onCloseImport,
  candidates,
  onAddItems,
  optionsOpen,
  onCloseOptions,
  onOpenDetails,
  onStartEditing,
  onOpenCover,
  onTogglePrivacy,
  onToggleArchive,
  onShare,
  onOpenConfirmDelete,
  coverOpen,
  onCloseCover,
  items,
  coverItemId,
  onSelectCover,
  detailsOpen,
  onCloseDetails,
  initialDetails,
  onSaveDetails,
  confirmDelete,
  onCloseConfirmDelete,
  onDeleteCollection,
}: CollectionSheetsGroupProps) {
  return (
    <>
      <CollectionImportSheet
        open={importOpen}
        onClose={onCloseImport}
        candidates={candidates}
        onAdd={onAddItems}
      />

      {/* Owner options — every row runs a real action; destructive delete
          gets its own confirm sheet (mobile ConfirmationSheet grammar). */}
      <Sheet
        open={optionsOpen}
        onClose={onCloseOptions}
        title="Collection options"
        maxWidth={400}
      >
        <div className="px-5 pb-5">
          <ul className="flex flex-col">
            <li>
              <button
                type="button"
                onClick={() => {
                  onCloseOptions();
                  onOpenDetails();
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="edit" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  Edit details
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  onCloseOptions();
                  onStartEditing();
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="layers" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  Manage items
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
            {!isCloset ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCloseOptions();
                    onOpenCover();
                  }}
                  className="pressable flex min-h-11 w-full items-center gap-3.5 py-3 text-left text-text-primary"
                >
                  <Icon name="image" size={20} />
                  <span className="flex-1 text-body-emphasis font-medium">
                    Change cover
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={onTogglePrivacy}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name={isPrivate ? 'lockOpen' : 'lock'} size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {isPrivate ? 'Make public' : 'Make private'}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={onToggleArchive}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="inventory" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {archived ? 'Unarchive board' : 'Archive board'}
                </span>
              </button>
            </li>
            {!isPrivate ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCloseOptions();
                    onShare();
                  }}
                  className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
                >
                  <Icon name="share" size={20} />
                  <span className="flex-1 text-body-emphasis font-medium">
                    Share collection
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={() => {
                  onCloseOptions();
                  onOpenConfirmDelete();
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-danger-text"
              >
                <Icon name="trash" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  Delete collection
                </span>
              </button>
            </li>
          </ul>
        </div>
      </Sheet>

      {/* Cover picker — only real item images front the board; "Automatic"
          restores the derived collage. No cover contract exists on the
          collections API, so the pick persists in boardPrefs. */}
      <Sheet
        open={coverOpen}
        onClose={onCloseCover}
        title="Board cover"
        maxWidth={440}
      >
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => onSelectCover(null)}
            className="pressable flex min-h-11 w-full items-center gap-3 text-left text-body-emphasis font-medium text-text-primary"
          >
            <Icon name="refresh" size={18} className="text-text-muted" />
            Automatic collage
            {!coverItemId ? (
              <Icon name="check" size={18} className="ml-auto text-brand" />
            ) : null}
          </button>
          {items.length === 0 ? (
            <p className="py-4 text-body text-text-muted">
              No items on this board to use as a cover yet.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {items.map((l) => {
                const active = coverItemId === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onSelectCover(l.id)}
                    aria-pressed={active}
                    aria-label={`Use “${l.title}” as the cover`}
                    className="pressable relative aspect-square overflow-hidden rounded-md bg-surface-alt"
                  >
                    <AppImage
                      src={getListingCoverUri(l.images)}
                      alt=""
                      fill
                      sizes="96px"
                      className="h-full w-full"
                    />
                    {active ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Icon
                          name="check"
                          size={20}
                          className="text-scrim-text-primary"
                        />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>

      {/* EditCollectionScreen parity — name, description, privacy. */}
      <EditCollectionSheet
        collectionId={id}
        open={detailsOpen}
        onClose={onCloseDetails}
        initial={initialDetails}
        onSave={onSaveDetails}
      />

      <Sheet
        open={confirmDelete}
        onClose={onCloseConfirmDelete}
        title="Delete collection"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            Delete “{title}”? The items stay in your saved and favourites.
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={onCloseConfirmDelete}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={onDeleteCollection}
            >
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
