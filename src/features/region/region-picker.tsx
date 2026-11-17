"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { NavigationControl, type MapRef } from "react-map-gl/maplibre";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
import { AtlasMapLazy } from "@/features/map/atlas-map-lazy";
import { api } from "@/lib/api";
import { call } from "@/lib/api/request";
import { boundsOf, RegionLayers } from "./region-layers";
import { partitionQueryKey, regionQueryKeys } from "./region-queries";
import styles from "./regions.module.css";

type RegionPartition = components["schemas"]["RegionPartition"];
type MunicipalityCollection = components["schemas"]["MunicipalityCollection"];

/** The current partition and the municipalities, both public. */
export function useRegions() {
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
  return { municipalities, partition };
}

/** Every region of the partition by name, with the municipality it lies in. */
export function regionOptions(partition: RegionPartition, municipalities: MunicipalityCollection | undefined): SearchSelectOption<number>[] {
  const names = new Map(municipalities?.features.map((feature) => [feature.id, feature.properties.name]));
  return partition.features
    .map((region) => ({
      value: region.id,
      label: region.properties.name,
      detail: names.get(region.properties.municipalityCode) ?? region.properties.municipalityCode,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es") || a.detail.localeCompare(b.detail, "es"));
}

interface RegionSelectProps {
  id: string;
  partition: RegionPartition;
  municipalities: MunicipalityCollection | undefined;
  value: number | undefined;
  onChange: (regionId: number) => void;
  invalid: boolean;
  disabled: boolean;
  "aria-describedby"?: string;
}

/** Picks a region of the current partition by name, with a search box to narrow the list. */
export function RegionSelect({ id, partition, municipalities, value, onChange, invalid, disabled, ...aria }: RegionSelectProps) {
  const options = useMemo(() => regionOptions(partition, municipalities), [partition, municipalities]);
  return (
    <SearchSelect
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Choose a region"
      searchLabel="Search regions by name"
      invalid={invalid}
      disabled={disabled}
      aria-describedby={aria["aria-describedby"]}
      testId="region-select"
    />
  );
}

/**
 * The partition on a map, with one region highlighted and brought into view. It only shows:
 * a report records a region, never a point (ADR 0013 in the system repository).
 */
export function RegionPreview({ partition, municipalities, regionId }: { partition: RegionPartition; municipalities: MunicipalityCollection | undefined; regionId: number | undefined }) {
  const regions = useMemo(
    () => partition.features.map((region) => ({ key: `r${region.id}`, id: region.id, ...region.properties, geometry: region.geometry })),
    [partition],
  );
  const mapRef = useRef<MapRef>(null);
  const selected = partition.features.find((region) => region.id === regionId);
  const allBounds = useMemo(() => boundsOf(partition.features.map((region) => region.geometry)), [partition]);

  const shownBounds = useMemo(() => (selected ? boundsOf([selected.geometry]) : allBounds), [selected, allBounds]);

  // A region can be chosen before the map has loaded, so the map also fits the view on load.
  useEffect(() => {
    if (shownBounds) {
      mapRef.current?.fitBounds(shownBounds, { padding: 32, maxZoom: 14, duration: 500 });
    }
  }, [shownBounds]);

  return (
    <div className={styles.pickerMap} data-testid="region-preview">
      <AtlasMapLazy
        ref={mapRef}
        initialViewState={{ bounds: allBounds, fitBoundsOptions: { padding: 24 } }}
        dragRotate={false}
        touchPitch={false}
        style={{ width: "100%", height: "100%" }}
        onLoad={(event) => {
          if (shownBounds) {
            event.target.fitBounds(shownBounds, { padding: 32, maxZoom: 14, duration: 0 });
          }
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <RegionLayers regions={regions} municipalities={municipalities} selectedKey={selected ? `r${selected.id}` : undefined} />
      </AtlasMapLazy>
      <p className={styles.pickerCaption} aria-live="polite">
        {selected ? `Showing ${selected.properties.name}.` : "The region you choose is shown here."}
      </p>
    </div>
  );
}
