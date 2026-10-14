import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { ButtonsSecion } from "@/components/sections";
import NewsEventsForm from "./NewsEventForm";


function NewsEvents() {
    return (
        <div>
            <ButtonsSecion>
                <SeeLogsButton name={"See news or event blogs"} href={"/admin#app.news-events-view"} />
            </ButtonsSecion>
            <NewsEventsForm />
        </div>
    )
}

export default NewsEvents;