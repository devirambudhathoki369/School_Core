import Signature from "./Signature";

function Signatures({ schoolProfile, issueDate, signees = null, showIssueDate = true }) {
    return (
        <>
            <div className="flex justify-between items-end mt-7">
                {
                    signees ?
                        <>
                            {
                                signees.map((signe, si) => (
                                    <Signature key={si} user={signe?.position} sign={signe?.sign} username={signe?.username} />
                                ))
                            }
                        </> :
                        <>
                            <Signature user={"Class Teacher"} sign={null} />
                            <Signature user={"Exam Coordinator"} sign={schoolProfile?.school_exam_coordinator_sign || schoolProfile?.exam_coordinator_sign || null} />
                            <Signature user={"Principal"} sign={schoolProfile?.school_sign || schoolProfile?.sign || null} />
                        </>
                }
            </div>
            {showIssueDate &&
                <div className="mt-3">
                    <span className="uppercase font-bold float-right">date of issue : {issueDate || "___________________________________"}</span>
                </div>
            }
        </>
    )
}

export default Signatures;