import { Button, Tooltip, Input, Popover, PopoverHandler, PopoverContent } from "@material-tailwind/react"
import { TextInput } from "."
import { MapPinIcon } from "@heroicons/react/24/outline";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";

export default function MapPicker({ locations, onSelect, value }) {
    const { notification: { updateNotification } } = useAppContext();
    const [openPicker, setOpenPicker] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef(null);
    const [map, setMap] = useState(null);
    const [searchBox, setSearchBox] = useState(null);
    // A pin chosen any way — map click, search suggestion, Enter-to-search —
    // must reach the form, or the station saves with null coordinates.
    // (Search used to only move the map, so searched pins were never saved.)
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const pick = useCallback(({ lat, lng }) => {
        setSelectedLocation({ lat, lng });
        onSelectRef.current?.({ latitude: lat, longitude: lng });
    }, []);
    // show the saved pin when an existing station is opened for editing
    useEffect(() => {
        const lat = parseFloat(value?.latitude), lng = parseFloat(value?.longitude);
        setSelectedLocation(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
    }, [value?.latitude, value?.longitude]);
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        libraries,
    });

    const onMapLoad = useCallback((map) => {
        setMap(map);
    }, []);

    const onMapClick = useCallback((event) => {
        if (event.latLng) {
            pick({ lat: event.latLng.lat(), lng: event.latLng.lng() });
        }
    }, [pick]);

    useEffect(() => {
        if (isLoaded && map && searchInputRef.current) {
            const searchBoxInstance = new window.google.maps.places.SearchBox(searchInputRef.current);
            setSearchBox(searchBoxInstance);

            // Bias the SearchBox results towards current map's viewport
            map.addListener("bounds_changed", () => {
                searchBoxInstance.setBounds(map.getBounds());
            });

            // Listen for the event fired when the user selects a prediction and retrieve
            // more details for that place
            searchBoxInstance.addListener("places_changed", () => {
                const places = searchBoxInstance.getPlaces();
                if (!places || places.length === 0) return;

                // For each place, get the location
                const bounds = new window.google.maps.LatLngBounds();
                places.forEach((place) => {
                    if (!place.geometry || !place.geometry.location) return;

                    // Set the selected location
                    const location = {
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng(),
                    };
                    pick(location);

                    // Center the map on the selected location
                    if (map) {
                        if (place.geometry.viewport) {
                            bounds.union(place.geometry.viewport);
                        } else {
                            bounds.extend(place.geometry.location);
                        }
                    }
                })

                map.fitBounds(bounds);
            })

            return () => {
                window.google.maps.event.clearInstanceListeners(searchBoxInstance);
            }
        }
    }, [isLoaded, map, pick]);

    const handleSearch = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 
        if (!searchQuery?.trim()) return;

        setIsSearching(true);
        // Create a geocoder to convert the search query to coordinates
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: searchQuery }, (results, status) => {
            if (status === "OK" && results && results[0]) {
                const location = {
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng(),
                }
                pick(location);
                if (map) {
                    map.setCenter(location);
                    map.setZoom(15);
                }
            } else {
                updateNotification(404, "Location not found!");
            }
            setIsSearching(false);
        })
    }

    function toggleMapPicker() {
        setOpenPicker(state => !state);
    }
    function resetMapPicker() {
        setSelectedLocation(null);
        setSearchQuery("");
    }

    if (loadError) {
        updateNotification(500, "Failed to load map!");
    }

    return (
        <div className="sm:col-span-4 bg-transparent">
            {/* same defect as the search picker: opened beside a full-width
                control, so on a phone it had nowhere to go */}
            <Popover placement="bottom-start" open={openPicker} handler={toggleMapPicker}>
                <PopoverHandler>
                    <div>
                        <Tooltip content="[Optional] Pick latitude and logitude for mobile application's gps service!">
                            {/* `app-soft-btn`: it was bare text until the pointer was
                                on it, so nothing said it could be pressed */}
                            <Button variant="text" type="button"
                                className="app-soft-btn w-full flex items-center justify-center gap-3 font-semibold text-balance">
                                <MapPinIcon className="icon" />
                                Pick a location
                            </Button>
                        </Tooltip>
                    </div>
                </PopoverHandler>
                <PopoverContent className="w-[min(92vw,32rem)] max-h-[min(75vh,34rem)] overflow-y-auto">
                    <div>
                        <div className="flex flex-col gap-y-1">
                            <form onSubmit={handleSearch}>
                                <Input ref={searchInputRef} name="search" value={searchQuery} onChange={({ name, value }) => setSearchQuery(value)}
                                    label="Search location" placeholder="Search for a location..." disabled={!isLoaded}
                                    className="text-black p-1.5 placeholder:text-gray-500 sm:text-base sm:leading-6 
                                    font-sans w-full my-0 bg-transparent focus:outline-none placeholder:text-sm" />
                            </form>
                            {/* map here! */}
                            <GoogleMap
                                mapContainerStyle={mapContainerStyle}
                                center={selectedLocation || defaultCenter}
                                zoom={15}
                                onClick={onMapClick}
                                onLoad={onMapLoad}
                                options={mapOptions}
                            >
                                {selectedLocation &&
                                    <Marker position={selectedLocation} animation={window.google.maps.Animation.DROP} />
                                }
                                {locations?.length > 0 &&
                                    <>
                                        {locations.map((location, li) => (
                                            <Marker key={li}
                                                position={location}
                                                label={{
                                                    text: location?.name
                                                }}
                                                icon={{
                                                    path: window.google?.maps?.SymbolPath?.CIRCLE || "",
                                                    scale: 8,
                                                    fillColor: "#22c55e",
                                                    fillOpacity: 1,
                                                    strokeWeight: 2,
                                                    strokeColor: "#ffffff",
                                                }}
                                                animation={window.google.maps.Animation.DROP}
                                            />
                                        ))}
                                    </>
                                }
                            </GoogleMap>
                        </div>
                        <div className="flex items-end justify-around mx-auto w-max gap-x-2 my-1">
                            {selectedLocation ?
                                <>
                                    <TextInput input={{ name: 'latitude', label: 'Latitude', readOnly: true }}
                                        value={selectedLocation?.lat} onChange={() => null} />
                                    <TextInput input={{ name: 'longitude', label: 'Longitude', readOnly: true }}
                                        value={selectedLocation?.lng} onChange={() => null} />
                                </> :
                                <p className="text-base my-1 text-muted-foreground">Click on the map to select a location</p>
                            }
                        </div>
                        <div className="flex items-end justify-around mx-auto w-max gap-x-2">
                            <Button variant="outlined" onClick={resetMapPicker} className="h-max">Reset</Button>
                            <Button variant="outlined" onClick={toggleMapPicker} className="h-max">Close</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}

const libraries = ["places"];
const mapContainerStyle = {
    width: "100%",
    height: "300px",
};
const defaultCenter = {
    lat: 28.1314,
    lng: 82.2973,
};
const mapOptions = {
    mapTypeId: "hybrid",
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
};