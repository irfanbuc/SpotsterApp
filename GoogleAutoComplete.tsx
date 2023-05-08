import {
  FC,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import parse from 'autosuggest-highlight/parse';
import throttle from 'lodash/throttle';
import { Loader } from '@googlemaps/js-api-loader';
import { Typography, Grid, Autocomplete, TextField, Box } from '@mui/material';

import LocationOnIcon from '@mui/icons-material/LocationOn';

const GOOGLE_MAPS_API_KEY = 'AIzaSyDENYHsnBbl-jCKKQj0Xy8tI2_8Uu739Ic';

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  version: 'weekly',
  libraries: ['places'],
});

type MainTextMatchedSubstrings = {
  offset: number;
  length: number;
};

type StructuredFormatting = {
  main_text: string;
  secondary_text: string;
  main_text_matched_substrings: readonly MainTextMatchedSubstrings[];
};

type PlaceType = {
  place_id: string;
  description: string;
  structured_formatting?: StructuredFormatting;
};

type GoogleAutocompleteProps = {
  value: {
    placeId: string;
    formattedAddress: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  onChange: (obj: object) => void;
  onBlur: () => void;
  error: string | null;
  disabled?: boolean;
  required?: boolean;
};

const GoogleAutocomplete: FC<GoogleAutocompleteProps> = ({
  value,
  onChange,
  onBlur,
  error,
  disabled,
  required,
}) => {
  const [selectedPlace, setSelectedPlace] = useState<PlaceType | any>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [predictions, setPredictions] = useState<readonly PlaceType[]>([]);
  const [isLoadingGoogleScript, setisLoadingGoogleScript] =
    useState<boolean>(false);
  const [defaultValuesInitialized, setdefaultValuesInitialized] =
    useState<boolean>(false);
  const autocompleteService = useRef(null);
  const placesServices = useRef(null);

  useEffect(() => {
    setisLoadingGoogleScript(true);
    loader.load().then((google) => {
      autocompleteService.current =
        new google.maps.places.AutocompleteService();

      placesServices.current = new (
        window as any
      ).google.maps.places.PlacesService(document.getElementById('results'));

      setisLoadingGoogleScript(false);
    });
  }, []);

  const getPredictions = useMemo(
    () =>
      throttle(
        (
          request: { input: string },
          callback: (results?: readonly PlaceType[]) => void
        ) => {
          (autocompleteService.current as any).getPlacePredictions(
            request,
            callback
          );
        },
        200
      ),
    []
  );

  const getPlaceDetails = useCallback(async (place: PlaceType | null) => {
    if (place) {
      await placesServices.current.getDetails(
        {
          placeId: place.place_id,
          fields: ['formatted_address', 'geometry.location', 'place_id'],
        },
        (res) => {
          onChange({
            formattedAddress: res.formatted_address,
            placeId: res.place_id,
            coordinates: {
              latitude: res.geometry.location.lat(),
              longitude: res.geometry.location.lng(),
            },
          });
          onBlur();
        }
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (isLoadingGoogleScript) return;

    if (!autocompleteService.current || !placesServices.current) {
      return;
    }

    if (inputValue === '') {
      setPredictions(selectedPlace ? [selectedPlace] : []);
      return;
    }

    getPredictions({ input: inputValue }, (results?: readonly PlaceType[]) => {
      if (active) {
        let newOptions: readonly PlaceType[] = [];

        if (selectedPlace) {
          newOptions = [selectedPlace];
        }

        if (results) {
          newOptions = [...newOptions, ...results];
        }

        setPredictions(newOptions);
      }
    });

    return () => {
      active = false;
    };
  }, [selectedPlace, inputValue, getPredictions, isLoadingGoogleScript]);

  useEffect(() => {
    // reset input field to passed newValue
    if (Object.keys(value).length !== 0 && !defaultValuesInitialized) {
      const newSelectedPlace = {
        place_id: value.placeId,
        description: '',
        structured_formatting: {
          main_text: value.formattedAddress.split(',')[0],
          secondary_text: value.formattedAddress.split(',').slice(1),
          main_text_matched_substrings: [
            {
              offset: value.formattedAddress.split(',')[0].length,
              length: 0,
            },
          ],
        },
      };
      setSelectedPlace(newSelectedPlace);
      setInputValue(value.formattedAddress);
      setdefaultValuesInitialized(true);
    } else {
      const geocoder = new window.google.maps.Geocoder();
      const latlng = {
        lat: value.coordinates.latitude,
        lng: value.coordinates.longitude,
      };
      geocoder.geocode({ location: latlng }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const formattedAddress = {
            place_id: results[0].place_id,
            description: results[0].formatted_address,
            structured_formatting: {
              main_text: results[0].formatted_address.split(',')[0],
              secondary_text: results[0].formatted_address.split(',').slice(1),
              main_text_matched_substrings: [
                {
                  offset: results[0].formatted_address.split(',')[0].length,
                  length: 0,
                },
              ],
            },
          };
          setSelectedPlace(formattedAddress);
          setInputValue(results[0].formatted_address);
          setdefaultValuesInitialized(true);
        } else {
          console.log(
            'Reverse geocode was not successful for the following reason: ' +
              status
          );
        }
      });
    }
  }, [value, defaultValuesInitialized]);

  return (
    <>
      <Autocomplete
        disabled={disabled}
        id="google-autocomplte"
        getOptionLabel={(option) =>
          typeof option === 'string' ? option : option.description
        }
        filterOptions={(x) => x}
        isOptionEqualToValue={(option, value) =>
          option.place_id === value.place_id
        }
        options={predictions}
        autoComplete
        includeInputInList
        filterSelectedOptions
        blurOnSelect
        loading={isLoadingGoogleScript}
        value={selectedPlace}
        onChange={(event, newValue: any) => {
          getPlaceDetails(newValue);
          setPredictions(newValue ? [newValue, ...predictions] : predictions);
          setSelectedPlace(newValue);
        }}
        onInputChange={(
          event: SyntheticEvent<Element, Event>,
          newInputValue: string,
          reason: string
        ) => {
          if (newInputValue !== '' || reason !== 'reset') {
            setInputValue(newInputValue);
            setSelectedPlace(null);
          }

          if (
            (reason === 'input' || reason === 'clear') &&
            Object.keys(value).length !== 0
          ) {
            onChange({});
          }
        }}
        inputValue={inputValue}
        renderInput={(params) => (
          <TextField
            {...params}
            required={required}
            onBlur={onBlur}
            label="Location"
            fullWidth
            error={!!error}
            helperText={error}
          />
        )}
        renderOption={(props, option) => {
          const matches =
            option.structured_formatting.main_text_matched_substrings;
          const parts = parse(
            option.structured_formatting.main_text,
            matches?.map((match: any) => [
              match.offset,
              match.offset + match?.length,
            ])
          );

          return (
            <li {...props}>
              <Grid container alignItems="center">
                <Grid item>
                  <Box
                    component={LocationOnIcon}
                    sx={{ color: 'text.secondary', mr: 2 }}
                  />
                </Grid>
                <Grid item xs>
                  {parts.map((part, index) => (
                    <span
                      key={index}
                      style={{
                        fontWeight: part.highlight ? 700 : 400,
                      }}
                    >
                      {part.text}
                    </span>
                  ))}
                  <Typography variant="body2" color="text.secondary">
                    {option.structured_formatting.secondary_text}
                  </Typography>
                </Grid>
              </Grid>
            </li>
          );
        }}
      />
      <div id="results"></div>
    </>
  );
};

export default GoogleAutocomplete;
