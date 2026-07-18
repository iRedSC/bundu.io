import type { RegistryId } from "@bundu/shared/registry";

/** Host-side allow/deny lists for stacking other tile entities. */
export type PlacementAllowDeny = {
    allowedStructures?: readonly RegistryId<"structure">[];
    deniedStructures?: readonly RegistryId<"structure">[];
    allowedRoofs?: readonly RegistryId<"structure">[];
    deniedRoofs?: readonly RegistryId<"structure">[];
    allowedFloors?: readonly RegistryId<"structure">[];
    deniedFloors?: readonly RegistryId<"structure">[];
    allowedResources?: readonly RegistryId<"resource">[];
    deniedResources?: readonly RegistryId<"resource">[];
};
