const ALLOWED_IMAGE_TYPES = [
    "image/png", "image/jpeg", "image/jpg"
];
const ACCEPT_STR = ALLOWED_IMAGE_TYPES.join(',')
const MAX_SIZE = 1; // MB
const aitString = ALLOWED_IMAGE_TYPES.map(e => e.split('/')[1]).join('/');

export { ALLOWED_IMAGE_TYPES, ACCEPT_STR, MAX_SIZE, aitString };