import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColorMode, EntityFilter, LayoutMode } from "./types";

interface GraphControlsProps {
  query: string;
  onQueryChange: (value: string) => void;
  entityFilter: EntityFilter;
  onEntityFilterChange: (value: EntityFilter) => void;
  minEdgeWeight: number;
  onMinEdgeWeightChange: (value: number) => void;
  maxEdgeWeight: number;
  colorMode: ColorMode;
  onColorModeChange: (value: ColorMode) => void;
  recentDays: number;
  onRecentDaysChange: (value: number) => void;
  selectedTag: string;
  onSelectedTagChange: (value: string) => void;
  tagCounts: [string, number][];
  layoutMode: LayoutMode;
  onLayoutModeChange: (value: LayoutMode) => void;
  branchFilter: string;
  onBranchFilterChange: (value: string) => void;
  branches: string[];
  isPlaying: boolean;
  onTogglePlay: () => void;
  focusNodeId: string | null;
  focusDepth: number;
  onFocusDepthChange: (value: number) => void;
  onClearFocus: () => void;
}

export function GraphControls(props: GraphControlsProps) {
  const { t } = useTranslation("graph");

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Row 1: All 6 controls in one line */}
        <div className="grid gap-3 grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("controls.search")}
            </p>
            <Input
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder={t("controls.searchPlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("controls.type")}
            </p>
            <Select
              value={props.entityFilter}
              onValueChange={(value) =>
                props.onEntityFilterChange(value as EntityFilter)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("controls.types.all")}</SelectItem>
                <SelectItem value="session">{t("types.session")}</SelectItem>
                <SelectItem value="rule">{t("types.rule")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("controls.minWeight")}
            </p>
            <Select
              value={String(props.minEdgeWeight)}
              onValueChange={(value) =>
                props.onMinEdgeWeightChange(Number(value))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({
                  length: Math.max(1, Math.min(8, props.maxEdgeWeight)),
                }).map((_, idx) => {
                  const weight = idx + 1;
                  return (
                    <SelectItem key={weight} value={String(weight)}>
                      {t("controls.minWeightValue", {
                        value: weight,
                      })}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("controls.colorMode")}
            </p>
            <Select
              value={props.colorMode}
              onValueChange={(value) =>
                props.onColorModeChange(value as ColorMode)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="type">
                  {t("controls.colorModes.type")}
                </SelectItem>
                <SelectItem value="cluster">
                  {t("controls.colorModes.cluster")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("controls.layout")}
            </p>
            <Select
              value={props.layoutMode}
              onValueChange={(value) =>
                props.onLayoutModeChange(value as LayoutMode)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="force">
                  {t("controls.layouts.force")}
                </SelectItem>
                <SelectItem value="td">{t("controls.layouts.flow")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("controls.branch")}
            </p>
            <Select
              value={props.branchFilter}
              onValueChange={props.onBranchFilterChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("controls.branches.all")}
                </SelectItem>
                {props.branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Time slider with Play/Pause button */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("controls.timeWindow")}</span>
            <div className="flex items-center gap-2">
              <span>
                {props.recentDays === 0
                  ? t("controls.timeAll")
                  : t("controls.timeDays", {
                      days: props.recentDays,
                    })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-5 px-2 text-xs"
                onClick={props.onTogglePlay}
              >
                {props.isPlaying ? t("controls.pause") : t("controls.play")}
              </Button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="365"
            step="5"
            value={props.recentDays}
            onChange={(event) =>
              props.onRecentDaysChange(Number(event.target.value))
            }
            className="h-2 w-full cursor-pointer accent-primary"
          />
        </div>

        {/* Row 3: Focus controls (only when focusNodeId is set) */}
        {props.focusNodeId && (
          <div className="flex items-center gap-3 border-t pt-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("controls.focusDepth")}</span>
                <span>
                  {t("controls.depthValue", {
                    value: props.focusDepth,
                  })}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="1"
                value={props.focusDepth}
                onChange={(event) =>
                  props.onFocusDepthChange(Number(event.target.value))
                }
                className="h-2 w-32 cursor-pointer accent-primary"
              />
            </div>
            <Button variant="outline" size="sm" onClick={props.onClearFocus}>
              {t("controls.clearFocus")}
            </Button>
          </div>
        )}

        {/* Row 4: Tag badges */}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Badge
            className="cursor-pointer"
            variant={props.selectedTag === "all" ? "default" : "outline"}
            onClick={() => props.onSelectedTagChange("all")}
          >
            {t("controls.tagsAll")}
          </Badge>
          {props.tagCounts.slice(0, 12).map(([tag, count]) => (
            <Badge
              key={tag}
              className="cursor-pointer"
              variant={props.selectedTag === tag ? "default" : "secondary"}
              onClick={() => props.onSelectedTagChange(tag)}
            >
              {tag} ({count})
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
