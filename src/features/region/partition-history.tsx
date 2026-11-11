"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { NavigationControl } from "react-map-gl/maplibre";
import ui from "@/components/ui.module.css";
import { AtlasMapLazy } from "@/features/map/atlas-map-lazy";
import { call } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { draftFrom, savedKey } from "./partition-draft";
import { markColors } from "./region-colors";
import { failureCopy } from "./region-copy";
import { boundsOf, regionFillLayer, RegionLayers } from "./region-layers";
import { regionQueryKeys } from "./region-queries";
import styles from "./regions.module.css";

type PartitionVersion = components["schemas"]["PartitionVersion"];

const pageSize = 50;
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** The saved versions of the partition, newest first, and one of them on the map, read only. */
export function PartitionHistory() {
  const api = useSessionApi();
  const [selectedNumber, setSelectedNumber] = useQueryState("version", parseAsInteger.withOptions({ history: "push" }));
  const [hovered, setHovered] = useState<string>();

  const versions = useInfiniteQuery({
    queryKey: regionQueryKeys.versions,
    queryFn: ({ pageParam }) =>
      call(() => api.GET("/region-partition/versions", { params: { query: { limit: pageSize, ...(pageParam && { cursor: pageParam }) } } })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  const municipalities = useQuery({
    queryKey: regionQueryKeys.municipalities,
    queryFn: () => call(() => api.GET("/municipalities")),
    staleTime: Infinity,
  });

  const items = useMemo(() => versions.data?.pages.flatMap((page) => page.items) ?? [], [versions.data]);
  const number = selectedNumber ?? items[0]?.number;
  const summary = items.find((version) => version.number === number);

  const partition = useQuery({
    queryKey: regionQueryKeys.version(number ?? 0),
    queryFn: () => call(() => api.GET("/region-partition/versions/{number}", { params: { path: { number: number as number } } })),
    enabled: number !== undefined,
    staleTime: Infinity,
  });
  const regions = useMemo(() => (partition.data ? [...draftFrom(partition.data).regions.values()] : []), [partition.data]);
  const hoveredRegion = regions.find((region) => region.key === hovered);

  // Open on what the version touched, so its outlines are visible; on the whole area when it
  // touched nothing still there, or everything, as the initial load does.
  const touchedBounds = useMemo(() => {
    if (!summary || summary.number === 1) {
      return undefined;
    }
    const touched = new Set([...summary.added, ...summary.changed].map(savedKey));
    return boundsOf(regions.filter((region) => touched.has(region.key)).map((region) => region.geometry));
  }, [regions, summary]);

  const error = versions.error ?? municipalities.error ?? partition.error;
  if (error) {
    return (
      <p className={styles.loadError} role="alert">
        {failureCopy(error, "The version history could not be loaded. Reload the page to try again.")}
      </p>
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.mapFrame} data-testid="history-map">
        {partition.data && municipalities.data ? (
          <AtlasMapLazy
            key={partition.data.version}
            initialViewState={{
              bounds: touchedBounds ?? boundsOf(municipalities.data.features.map((feature) => feature.geometry)),
              fitBoundsOptions: { padding: touchedBounds ? 120 : 32, maxZoom: 15 },
            }}
            interactiveLayerIds={[regionFillLayer]}
            onMouseMove={(event) => setHovered(event.features?.[0]?.properties?.key as string | undefined)}
            onMouseLeave={() => setHovered(undefined)}
            style={{ width: "100%", height: "100%" }}
          >
            <NavigationControl position="top-right" showCompass={false} />
            <RegionLayers
              regions={regions}
              municipalities={municipalities.data}
              marks={
                summary
                  ? [
                      { keys: summary.changed.map(savedKey), color: markColors.changed },
                      { keys: summary.added.map(savedKey), color: markColors.added },
                    ]
                  : []
              }
            />
          </AtlasMapLazy>
        ) : (
          <p className={styles.mapLoading}>Loading the version...</p>
        )}
        {hoveredRegion && (
          <div className={styles.hoverCard} aria-hidden>
            <strong>{hoveredRegion.name}</strong>
            <span>
              Id {hoveredRegion.id} · population {hoveredRegion.population.toLocaleString("en")}
            </span>
          </div>
        )}
      </div>

      <aside className={styles.panel} aria-label="Versions">
        {summary && <VersionSummary version={summary} />}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Versions</h2>
          {versions.isPending ? (
            <p className={styles.muted}>Loading...</p>
          ) : (
            <ul className={styles.versions}>
              {items.map((version) => (
                <li key={version.number}>
                  <a
                    href={`?version=${version.number}`}
                    className={styles.version}
                    aria-current={version.number === number ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      void setSelectedNumber(version.number);
                    }}
                  >
                    <strong>Version {version.number}</strong>
                    <span className={styles.muted}>
                      {dateFormat.format(new Date(version.createdAt))} · {authorOf(version)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {versions.hasNextPage && (
            <button type="button" className={ui.button} onClick={() => void versions.fetchNextPage()} disabled={versions.isFetchingNextPage}>
              {versions.isFetchingNextPage ? "Loading..." : "Older versions"}
            </button>
          )}
        </section>
        <Link href="/admin/regions" className={styles.historyLink}>
          Back to the editor
        </Link>
      </aside>
    </div>
  );
}

function VersionSummary({ version }: { version: PartitionVersion }) {
  return (
    <section className={styles.card} data-testid="version-summary">
      <h2 className={styles.cardTitle}>Version {version.number}</h2>
      <p className={styles.muted}>
        Saved {dateFormat.format(new Date(version.createdAt))} by {authorOf(version)}.
      </p>
      <p className={styles.muted}>
        {count(version.added.length, "region")} added, {version.changed.length} changed, {version.retired.length} retired.
      </p>
      <ul className={styles.legend}>
        <li>
          <span className={styles.swatch} style={{ background: markColors.added }} /> Added
        </li>
        <li>
          <span className={styles.swatch} style={{ background: markColors.changed }} /> Changed
        </li>
      </ul>
      {version.retired.length > 0 && (
        <p className={styles.hint}>Retired: {version.retired.join(", ")}</p>
      )}
    </section>
  );
}

function authorOf(version: PartitionVersion): string {
  if (!version.author) {
    return "the initial load";
  }
  return version.author.name ?? version.author.username ?? "an admin";
}

function count(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}
