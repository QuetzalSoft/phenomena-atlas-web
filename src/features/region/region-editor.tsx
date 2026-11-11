"use client";

import type { Feature, FeatureCollection } from "geojson";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Layer, type MapLayerMouseEvent, type MapRef, NavigationControl, Source } from "react-map-gl/maplibre";
import ui from "@/components/ui.module.css";
import { SignInLink } from "@/features/account/sign-in-link";
import { AtlasMapLazy } from "@/features/map/atlas-map-lazy";
import { mapViewParsers, roundView } from "@/features/map/map-view";
import { call, RequestFailed } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { applyEdit, draftFrom, hasChanges, nextNewKey, type PartitionDraft, savedKey, toChange } from "./partition-draft";
import {
  type EditableRegion,
  mergeRegions,
  type MultiPolygon,
  type Position,
  reassignArea,
  splitPopulation,
  splitRegion,
} from "./partition-ops";
import { markColors } from "./region-colors";
import { failureCopy, operationCopy } from "./region-copy";
import { boundsOf, regionFillLayer, RegionLayers } from "./region-layers";
import { partitionQueryKey, regionQueryKeys } from "./region-queries";
import styles from "./regions.module.css";

type Tool = { kind: "select" } | { kind: "merge" } | { kind: "split" | "reassign"; points: Position[] };

interface PendingSplit {
  regionKey: string;
  kept: MultiPolygon;
  cut: MultiPolygon;
  name: string;
  keptPopulation: number;
  cutPopulation: number;
}

interface Message {
  tone: "ok" | "info" | "error";
  text: string;
  action?: ReactNode;
}

interface Problem {
  keys: string[];
  area?: MultiPolygon;
}

const numberFormat = new Intl.NumberFormat("en");

/**
 * The admin's region editor: the partition on a map, the tools that reshape it, and the
 * changes waiting to be saved as the next version.
 */
export function RegionEditor() {
  const api = useSessionApi();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapRef>(null);

  const municipalities = useQuery({
    queryKey: regionQueryKeys.municipalities,
    queryFn: () => call(() => api.GET("/municipalities")),
    staleTime: Infinity,
  });
  const partition = useQuery({
    queryKey: partitionQueryKey,
    queryFn: () => call(() => api.GET("/region-partition")),
    refetchOnWindowFocus: false,
  });

  // The saved partition as a draft, and the admin's edits on top of it until they are saved.
  const pristine = useMemo(() => partition.data && draftFrom(partition.data), [partition.data]);
  const [edits, setEdits] = useState<PartitionDraft>();
  const draft = edits ?? pristine;

  const [selectedKey, setSelectedKey] = useState<string>();
  const [hoveredKey, setHoveredKey] = useState<string>();
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [pendingSplit, setPendingSplit] = useState<PendingSplit>();
  const [message, setMessage] = useState<Message>();
  const [problem, setProblem] = useState<Problem>();
  const [view, setView] = useQueryStates(mapViewParsers, { history: "replace" });

  const selected = selectedKey ? draft?.regions.get(selectedKey) : undefined;
  const hovered = hoveredKey ? draft?.regions.get(hoveredKey) : undefined;
  const municipalityName = (code: string) =>
    municipalities.data?.features.find((municipality) => municipality.id === code)?.properties.name ?? code;
  const drawing = tool.kind === "split" || tool.kind === "reassign" ? tool : undefined;

  const edit = (next: PartitionDraft, text?: string) => {
    setEdits(next);
    setProblem(undefined);
    setMessage(text ? { tone: "info", text } : undefined);
  };

  const cancelTool = () => {
    setTool({ kind: "select" });
    setPendingSplit(undefined);
  };

  const finishDrawing = () => {
    if (!draft || !selected || !drawing) {
      return;
    }
    if (drawing.kind === "split") {
      const result = splitRegion(selected.geometry, drawing.points);
      if (!result.ok) {
        setMessage({ tone: "error", text: operationCopy(result.error) });
        return;
      }
      const [keptPopulation, cutPopulation] = splitPopulation(selected.population, result.value.kept, result.value.cut);
      setPendingSplit({ regionKey: selected.key, ...result.value, name: `${selected.name} 2`, keptPopulation, cutPopulation });
      setTool({ kind: "select" });
      setMessage(undefined);
      return;
    }
    const municipality = municipalities.data?.features.find((feature) => feature.id === selected.municipalityCode);
    if (!municipality) {
      return;
    }
    const result = reassignArea(drawing.points, selected, draft.regions.values(), municipality.geometry);
    if (!result.ok) {
      setMessage({ tone: "error", text: operationCopy(result.error) });
      return;
    }
    const emptied = result.value.neighbours.filter((neighbour) => !neighbour.geometry).map((neighbour) => neighbour.key);
    const shrunk = result.value.neighbours.flatMap(({ key, geometry }) => {
      const region = draft.regions.get(key);
      return region && geometry ? [{ ...region, geometry }] : [];
    });
    setTool({ kind: "select" });
    edit(
      applyEdit(draft, { upsert: [{ ...selected, geometry: result.value.target }, ...shrunk], remove: emptied }),
      `${selected.name} took land from ${result.value.neighbours.length} ${result.value.neighbours.length === 1 ? "region" : "regions"}` +
        (emptied.length > 0 ? `; ${emptied.length} left with none will be retired.` : ". Check their populations."),
    );
  };

  const confirmSplit = () => {
    const region = pendingSplit && draft?.regions.get(pendingSplit.regionKey);
    if (!draft || !pendingSplit || !region || !pendingSplit.name.trim()) {
      return;
    }
    const { key, draft: numbered } = nextNewKey(draft);
    edit(
      applyEdit(numbered, {
        upsert: [
          { ...region, geometry: pendingSplit.kept, population: pendingSplit.keptPopulation },
          {
            key,
            name: pendingSplit.name.trim(),
            population: pendingSplit.cutPopulation,
            municipalityCode: region.municipalityCode,
            geometry: pendingSplit.cut,
          },
        ],
      }),
      `${region.name} was split. The new region is ${pendingSplit.name.trim()}.`,
    );
    setPendingSplit(undefined);
  };

  const merge = (keep: EditableRegion, absorb: EditableRegion) => {
    if (!draft) {
      return;
    }
    const result = mergeRegions(keep, absorb);
    if (!result.ok) {
      setMessage({ tone: "error", text: operationCopy(result.error) });
      return;
    }
    setTool({ kind: "select" });
    edit(
      applyEdit(draft, {
        upsert: [{ ...keep, geometry: result.value, population: keep.population + absorb.population }],
        remove: [absorb.key],
      }),
      `${absorb.name} was merged into ${keep.name}, and their populations added up.`,
    );
  };

  const updateSelected = (patch: Partial<Pick<EditableRegion, "name" | "population">>) => {
    if (draft && selected) {
      edit(applyEdit(draft, { upsert: [{ ...selected, ...patch }] }));
    }
  };

  const save = useMutation({
    mutationFn: (change: ReturnType<typeof toChange>) =>
      call(() => api.POST("/region-partition/versions", { body: change.change })),
    onMutate: () => {
      setMessage(undefined);
      setProblem(undefined);
    },
    onSuccess: async (version) => {
      // Keep showing the edits until the saved version has replaced them on the map.
      await queryClient.invalidateQueries({ queryKey: regionQueryKeys.all });
      setEdits(undefined);
      setMessage({ tone: "ok", text: `Saved as version ${version.number}.` });
    },
    onError: (error, change) => {
      const failure = error instanceof RequestFailed ? error : new RequestFailed(undefined, undefined);
      const details = failure.details ?? {};
      const regionIds = Array.isArray(details.regionIds) ? (details.regionIds as number[]) : [];
      const draftIndexes = Array.isArray(details.draftIndexes) ? (details.draftIndexes as number[]) : [];
      setProblem({
        keys: [...regionIds.map(savedKey), ...draftIndexes.flatMap((index) => change.keys[index] ?? [])],
        ...(details.geometry !== undefined && { area: details.geometry as MultiPolygon }),
      });
      setMessage({
        tone: "error",
        text: failureCopy(failure, "The change could not be saved. Try again."),
        ...(failure.code === "partition_version_conflict" && {
          action: (
            <button type="button" className={ui.button} onClick={() => void reloadLatest()}>
              Load the latest version
            </button>
          ),
        }),
        ...(failure.status === 401 && { action: <SignInLink label="Sign in again" /> }),
      });
    },
  });

  const reloadLatest = async () => {
    await queryClient.invalidateQueries({ queryKey: regionQueryKeys.all });
    setEdits(undefined);
    setProblem(undefined);
    setMessage(undefined);
    cancelTool();
  };

  const discard = () => {
    setEdits(undefined);
    setProblem(undefined);
    setMessage(undefined);
    cancelTool();
  };

  // Drawing: Enter finishes, Escape cancels.
  useEffect(() => {
    if (tool.kind === "select") {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTool({ kind: "select" });
      } else if (event.key === "Enter" && (event.target as HTMLElement | null)?.tagName !== "INPUT") {
        finishButton.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.kind]);
  const finishButton = useRef<HTMLButtonElement>(null);

  // Unsaved edits are lost on leaving: ask first.
  const unsaved = draft !== undefined && hasChanges(draft);
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const onMapClick = (event: MapLayerMouseEvent) => {
    if (drawing) {
      setTool({ ...drawing, points: [...drawing.points, [event.lngLat.lng, event.lngLat.lat]] });
      return;
    }
    const key = event.features?.[0]?.properties?.key as string | undefined;
    if (tool.kind === "merge") {
      const other = key ? draft?.regions.get(key) : undefined;
      if (selected && other && other.key !== selected.key) {
        merge(selected, other);
      }
      return;
    }
    setSelectedKey(key);
    setPendingSplit(undefined);
  };

  const fitTo = (geometries: Iterable<MultiPolygon>, maxZoom = 15) => {
    const bounds = boundsOf(geometries);
    if (bounds) {
      // Room around the region to draw a line across it, and below the drawing bar.
      mapRef.current?.fitBounds(bounds, { padding: { top: 120, bottom: 80, left: 80, right: 80 }, maxZoom, duration: 600 });
    }
  };

  const regions = useMemo(() => (draft ? [...draft.regions.values()] : []), [draft]);
  const editedKeys = draft?.edited ?? [];
  const drawingData = useMemo(() => drawingFeatures(drawing), [drawing]);
  const splitPreview = useMemo(() => pendingSplit && splitFeatures(pendingSplit), [pendingSplit]);

  if (partition.isError || municipalities.isError) {
    const error = partition.error ?? municipalities.error;
    return (
      <p className={styles.loadError} role="alert">
        {failureCopy(error, "The regions could not be loaded. Reload the page to try again.")}
      </p>
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.mapFrame} data-testid="region-map" data-tool={tool.kind}>
        {draft && municipalities.data ? (
          <AtlasMapLazy
            ref={mapRef}
            initialViewState={
              view.lng !== null && view.lat !== null && view.zoom !== null
                ? { longitude: view.lng, latitude: view.lat, zoom: view.zoom }
                : { bounds: boundsOf(municipalities.data.features.map((feature) => feature.geometry)), fitBoundsOptions: { padding: 32 } }
            }
            onMoveEnd={(event) => void setView(roundView(event.viewState))}
            interactiveLayerIds={[regionFillLayer]}
            onClick={onMapClick}
            onMouseMove={(event) => {
              const key = event.features?.[0]?.properties?.key as string | undefined;
              if (key !== hoveredKey) {
                setHoveredKey(key);
              }
            }}
            onMouseLeave={() => setHoveredKey(undefined)}
            cursor={drawing ? "crosshair" : hoveredKey ? "pointer" : "grab"}
            doubleClickZoom={!drawing}
            style={{ width: "100%", height: "100%" }}
          >
            <NavigationControl position="top-right" showCompass={false} />
            <RegionLayers
              regions={regions}
              municipalities={municipalities.data}
              selectedKey={selectedKey}
              marks={[
                { keys: editedKeys, color: markColors.changed, dashed: true },
                { keys: problem?.keys ?? [], color: markColors.problem },
              ]}
              problemArea={problem?.area}
            />
            {splitPreview && (
              <Source id="split-preview" type="geojson" data={splitPreview}>
                <Layer
                  id="split-preview-fill"
                  type="fill"
                  paint={{ "fill-color": ["match", ["get", "part"], "cut", markColors.added, markColors.selected], "fill-opacity": 0.45 }}
                />
              </Source>
            )}
            <Source id="drawing" type="geojson" data={drawingData}>
              <Layer id="drawing-area" type="fill" filter={["==", ["geometry-type"], "Polygon"]} paint={{ "fill-color": markColors.selected, "fill-opacity": 0.2 }} />
              <Layer id="drawing-line" type="line" filter={["!=", ["geometry-type"], "Point"]} paint={{ "line-color": markColors.selected, "line-width": 2.5, "line-dasharray": [2, 1] }} />
              <Layer
                id="drawing-vertices"
                type="circle"
                filter={["==", ["geometry-type"], "Point"]}
                paint={{ "circle-radius": 4.5, "circle-color": "#ffffff", "circle-stroke-color": markColors.selected, "circle-stroke-width": 2 }}
              />
            </Source>
          </AtlasMapLazy>
        ) : (
          <p className={styles.mapLoading}>Loading the regions...</p>
        )}
        {hovered && !drawing && (
          <div className={styles.hoverCard} aria-hidden>
            <strong>{hovered.name}</strong>
            <span>{municipalityName(hovered.municipalityCode)}</span>
          </div>
        )}
        {drawing && (
          <div className={styles.drawingBar} role="toolbar" aria-label="Drawing">
            <span>
              {drawing.kind === "split"
                ? "Click points of a line that crosses the region."
                : "Click the corners of the area to give to the region."}{" "}
              <span className={styles.muted}>
                {drawing.points.length} {drawing.points.length === 1 ? "point" : "points"}
              </span>
            </span>
            <button
              ref={finishButton}
              type="button"
              className={`${ui.button} ${styles.primary}`}
              onClick={finishDrawing}
              disabled={drawing.points.length < (drawing.kind === "split" ? 2 : 3)}
            >
              Finish
            </button>
            <button type="button" className={ui.button} onClick={cancelTool}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <aside className={styles.panel} aria-label="Region editor">
        {draft && (
          <RegionSearch
            regions={regions}
            municipalityName={municipalityName}
            onPick={(region) => {
              setSelectedKey(region.key);
              setPendingSplit(undefined);
              cancelTool();
              fitTo([region.geometry]);
            }}
          />
        )}

        {message && (
          <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"} data-testid="region-message">
            <p>{message.text}</p>
            {message.action}
          </div>
        )}

        {selected ? (
          <section className={styles.card} data-testid="selected-region">
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{selected.name}</h2>
              <button type="button" className={styles.linkButton} onClick={() => { setSelectedKey(undefined); cancelTool(); }}>
                Close
              </button>
            </div>
            <dl className={styles.facts}>
              <dt>Id</dt>
              <dd data-testid="selected-region-id">
                {selected.id !== undefined ? (
                  <>
                    <code>{selected.id}</code>{" "}
                    <button type="button" className={styles.linkButton} onClick={() => void navigator.clipboard?.writeText(String(selected.id))}>
                      Copy
                    </button>
                  </>
                ) : (
                  <span className={styles.muted}>Assigned when saved</span>
                )}
              </dd>
              <dt>Municipality</dt>
              <dd>{municipalityName(selected.municipalityCode)}</dd>
            </dl>
            <label className={styles.field}>
              <span>Name</span>
              <input
                className={styles.input}
                value={selected.name}
                maxLength={200}
                onChange={(event) => updateSelected({ name: event.target.value })}
                aria-invalid={selected.name.trim() === "" || undefined}
              />
            </label>
            <label className={styles.field}>
              <span>Population</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={selected.population}
                onChange={(event) => updateSelected({ population: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })}
              />
            </label>

            {pendingSplit ? (
              <form
                className={styles.subform}
                onSubmit={(event) => {
                  event.preventDefault();
                  confirmSplit();
                }}
              >
                <p className={styles.subformTitle}>Split into two regions</p>
                <label className={styles.field}>
                  <span>New region name</span>
                  <input
                    className={styles.input}
                    value={pendingSplit.name}
                    maxLength={200}
                    onChange={(event) => setPendingSplit({ ...pendingSplit, name: event.target.value })}
                    autoFocus
                  />
                </label>
                <div className={styles.twoColumns}>
                  <label className={styles.field}>
                    <span>{selected.name}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={pendingSplit.keptPopulation}
                      aria-label={`Population of ${selected.name}`}
                      onChange={(event) => setPendingSplit({ ...pendingSplit, keptPopulation: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>New region</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={pendingSplit.cutPopulation}
                      aria-label="Population of the new region"
                      onChange={(event) => setPendingSplit({ ...pendingSplit, cutPopulation: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })}
                    />
                  </label>
                </div>
                <p className={styles.hint}>Populations start in proportion to area. The new region is shown in green.</p>
                <div className={styles.actions}>
                  <button type="submit" className={`${ui.button} ${styles.primary}`} disabled={!pendingSplit.name.trim()}>
                    Apply split
                  </button>
                  <button type="button" className={ui.button} onClick={() => setPendingSplit(undefined)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.tools}>
                <button type="button" className={ui.button} onClick={() => { setMessage(undefined); setTool({ kind: "split", points: [] }); }} disabled={!!drawing}>
                  Split
                </button>
                <button
                  type="button"
                  className={ui.button}
                  aria-pressed={tool.kind === "merge"}
                  onClick={() => {
                    setMessage(tool.kind === "merge" ? undefined : { tone: "info", text: `Click a neighbouring region to merge it into ${selected.name}.` });
                    setTool(tool.kind === "merge" ? { kind: "select" } : { kind: "merge" });
                  }}
                  disabled={!!drawing}
                >
                  {tool.kind === "merge" ? "Cancel merge" : "Merge a neighbour"}
                </button>
                <button type="button" className={ui.button} onClick={() => { setMessage(undefined); setTool({ kind: "reassign", points: [] }); }} disabled={!!drawing}>
                  Reassign area
                </button>
              </div>
            )}
          </section>
        ) : (
          draft && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Version {draft.baseVersion}</h2>
              <p className={styles.muted}>
                {numberFormat.format(regions.length)} regions in {municipalities.data?.features.length ?? 0} municipalities. Select a region on the map
                or search for it to edit it.
              </p>
            </section>
          )
        )}

        {draft && (
          <PendingChanges
            draft={draft}
            saving={save.isPending}
            onSave={() => save.mutate(toChange(draft))}
            onDiscard={discard}
            onPick={(key) => setSelectedKey(key)}
          />
        )}

        <Link href="/admin/regions/history" className={styles.historyLink}>
          Version history
        </Link>
      </aside>
    </div>
  );
}

function RegionSearch({
  regions,
  municipalityName,
  onPick,
}: {
  regions: EditableRegion[];
  municipalityName: (code: string) => string;
  onPick: (region: EditableRegion) => void;
}) {
  const [text, setText] = useState("");
  const query = normalize(text.trim());
  const matches = query
    ? regions.filter((region) => normalize(region.name).includes(query) || String(region.id) === query).slice(0, 8)
    : [];

  return (
    <div className={styles.search}>
      <label className={styles.field}>
        <span>Find a region</span>
        <input
          className={styles.input}
          type="search"
          value={text}
          placeholder="Name or id"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {query && (
        <ul className={styles.results} aria-label="Matching regions">
          {matches.length === 0 && <li className={styles.muted}>No region matches.</li>}
          {matches.map((region) => (
            <li key={region.key}>
              <button
                type="button"
                className={styles.result}
                onClick={() => {
                  onPick(region);
                  setText("");
                }}
              >
                <span>{region.name}</span>
                <span className={styles.muted}>
                  {region.id ?? "new"} · {municipalityName(region.municipalityCode)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingChanges({
  draft,
  saving,
  onSave,
  onDiscard,
  onPick,
}: {
  draft: PartitionDraft;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onPick: (key: string) => void;
}) {
  const edited = draft.edited.flatMap((key) => draft.regions.get(key) ?? []);
  const invalid = edited.some((region) => region.name.trim() === "");
  const count = edited.length + draft.retired.length;

  return (
    <section className={styles.card} data-testid="pending-changes">
      <h2 className={styles.cardTitle}>Unsaved changes</h2>
      {count === 0 ? (
        <p className={styles.muted}>None. Changes stay here until you save them as a new version.</p>
      ) : (
        <>
          <ul className={styles.changes}>
            {edited.map((region) => (
              <li key={region.key}>
                <button type="button" className={styles.linkButton} onClick={() => onPick(region.key)}>
                  {region.name || "Unnamed region"}
                </button>
                <span className={styles.changeKind} data-kind={region.id === undefined ? "new" : "changed"}>
                  {region.id === undefined ? "new" : "changed"}
                </span>
              </li>
            ))}
            {draft.retired.map((id) => (
              <li key={id}>
                <span>Region {id}</span>
                <span className={styles.changeKind} data-kind="retired">retired</span>
              </li>
            ))}
          </ul>
          {invalid && <p className={styles.errorText}>Every region needs a name.</p>}
          <div className={styles.actions}>
            <button type="button" className={`${ui.button} ${styles.primary}`} onClick={onSave} disabled={saving || invalid}>
              {saving ? "Saving..." : "Save version"}
            </button>
            <button type="button" className={ui.button} onClick={onDiscard} disabled={saving}>
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** The line or area being drawn, with its vertices. */
function drawingFeatures(drawing: { kind: "split" | "reassign"; points: Position[] } | undefined): FeatureCollection {
  const features: Feature[] = [];
  if (drawing) {
    const { kind, points } = drawing;
    if (kind === "reassign" && points.length >= 3) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...points, points[0] as Position]] } });
    } else if (points.length >= 2) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } });
    }
    for (const point of points) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } });
    }
  }
  return { type: "FeatureCollection", features };
}

function splitFeatures(split: PendingSplit): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { part: "kept" }, geometry: split.kept as Feature["geometry"] },
      { type: "Feature", properties: { part: "cut" }, geometry: split.cut as Feature["geometry"] },
    ],
  };
}

/** Lower case without accents, so "tonala" finds "Tonalá". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
