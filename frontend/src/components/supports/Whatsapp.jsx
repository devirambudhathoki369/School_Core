import { WhatsappMark } from "./marks";

export default function WhatsappContact({ whatsapp_contact }) {
    return (
        <a href={whatsapp_contact} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-x-2">
            <WhatsappMark size={35} />
            <span className="font-semibold text-base">Whatsapp</span>
        </a>
    )
}
