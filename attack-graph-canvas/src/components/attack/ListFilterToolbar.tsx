import * as React from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterChipModel = {
  id: string;
  label: string;
  onRemove: () => void;
};

export type ListFilterToolbarProps = {
  /** Sol tarafta sabit kontroller (ör. geri link, sekme) */
  leading?: React.ReactNode;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Kontroller (arama ile filtre butonu arası), örn. oturum seçici */
  betweenSearchAndFilters?: React.ReactNode;
  /** Sağ uç aksiyonları (ör. yenile, dışa aktar) — filtre düğmesinin sağında */
  trailingActions?: React.ReactNode;
  filterPanel: React.ReactNode;
  /** Açılır panel genişliği */
  panelClassName?: string;
  /** Rozette gösterilecek aktif fazet sayısı; verilmezse chips.length kullanılır */
  activeFacetCount?: number;
  chips?: FilterChipModel[];
  onClearAllFacets?: () => void;
  /** Örn. "12 sonuç" */
  summary?: string;
  className?: string;
};

export function ListFilterToolbar({
  leading,
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  betweenSearchAndFilters,
  trailingActions,
  filterPanel,
  panelClassName,
  activeFacetCount,
  chips = [],
  onClearAllFacets,
  summary,
  className,
}: ListFilterToolbarProps) {
  const [filterOpen, setFilterOpen] = React.useState(false);
  const facetCount = activeFacetCount ?? chips.length;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {leading ? <div className="flex flex-wrap items-center gap-2 shrink-0">{leading}</div> : null}
        <div className="relative flex-1 min-w-[160px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-9 pl-9 pr-8 rounded-full bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {betweenSearchAndFilters}

        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-9 shrink-0 gap-1.5 rounded-full border-border bg-card px-3 flex-none",
                facetCount > 0 && "border-primary/50 bg-primary/5",
              )}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Filters</span>
              {facetCount > 0 ? (
                <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground">
                  {facetCount > 99 ? "99+" : facetCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className={cn("w-80 p-0", panelClassName)}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
              {facetCount > 0 && onClearAllFacets ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary hover:underline"
                  onClick={() => onClearAllFacets()}
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="max-h-[min(70vh,420px)] overflow-y-auto p-3">{filterPanel}</div>
          </PopoverContent>
        </Popover>

        {trailingActions ? (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto shrink-0">{trailingActions}</div>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 min-h-[26px]">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Active</span>
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={c.onRemove}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2 pr-1.5 text-[11px] text-foreground hover:bg-muted"
            >
              <span className="truncate">{c.label}</span>
              <X className="w-3 h-3 shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      ) : null}

      {summary ? <p className="text-[11px] text-muted-foreground">{summary}</p> : null}
    </div>
  );
}
