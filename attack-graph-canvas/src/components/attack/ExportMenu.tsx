import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ExtraExport {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

interface ExportMenuProps {
  /** Number of rows currently in scope; disables the menu when 0. */
  count: number;
  onExportCsv: () => void;
  onExportJson: () => void;
  /** Optional domain-specific formats (e.g. hashcat). */
  extra?: ExtraExport[];
  label?: string;
}

/** A compact CSV/JSON export dropdown for list-page toolbars. */
export function ExportMenu({ count, onExportCsv, onExportJson, extra, label = "Export" }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={count === 0}
          className="h-9 shrink-0 gap-1.5 rounded-full border-border bg-card px-3"
          title={count === 0 ? "Nothing to export" : `Export ${count} row${count === 1 ? "" : "s"}`}
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
          {count > 0 && (
            <span className="ml-0.5 hidden text-[10px] tabular-nums text-muted-foreground sm:inline">
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Export {count} row{count === 1 ? "" : "s"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onExportCsv} className="gap-2 text-xs cursor-pointer">
          <FileSpreadsheet className="h-3.5 w-3.5" /> CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportJson} className="gap-2 text-xs cursor-pointer">
          <FileJson className="h-3.5 w-3.5" /> JSON (.json)
        </DropdownMenuItem>
        {extra && extra.length > 0 && <DropdownMenuSeparator />}
        {extra?.map((e) => {
          const Icon = e.icon ?? Download;
          return (
            <DropdownMenuItem key={e.label} onSelect={e.onSelect} className="gap-2 text-xs cursor-pointer">
              <Icon className="h-3.5 w-3.5" /> {e.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
