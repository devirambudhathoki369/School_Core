// TODO: clean this file properly (keep required only)!
const UPDATE_SCHEMA = {
    transportation_info: { bus_station: '', start_date: '' },
    roll_no: '', symbol_no: '', regd_no: '',
},
    UPDATE_TYPES = {
        transportation_info: 'transportation_info',
        guardian_info: 'guardian_info',
        other_info: 'other_info',
        general: 'general',
        image: 'image',
        identity: 'identity',
    },
    // GENERAL_UPDATES = [UPDATE_TYPES.transportation_info, UPDATE_TYPES.general],
    UPDATE_CONFIGS = {
        [UPDATE_TYPES.transportation_info]: {
            URL: '/api/students/transportations'
        },
        [UPDATE_TYPES.image]: {
            URL: '/api/students'
        },
        [UPDATE_TYPES.identity]: {
            URL: '/api/students'
        },
        [UPDATE_TYPES.general]: {
            URL: '/api/students'
        }
    },
    UPDATE_OPTIONS = [
        { name: UPDATE_TYPES.general, value: UPDATE_TYPES.general },
        { name: UPDATE_TYPES.identity, value: UPDATE_TYPES.identity },
        { name: UPDATE_TYPES.transportation_info, value: UPDATE_TYPES.transportation_info },
        { name: UPDATE_TYPES.image, value: UPDATE_TYPES.image },
    ];

export { UPDATE_SCHEMA, UPDATE_TYPES, UPDATE_CONFIGS, UPDATE_OPTIONS };