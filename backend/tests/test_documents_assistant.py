import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ.setdefault("FIRASA_LLM_PROVIDER", "stub")

from app.schema import ProjectProfile
from app.orchestrator import grounded_assistant_reply
from app import store


def test_assistant_document_grounding():
    # 1. Create a dummy project
    profile = ProjectProfile(
        name="Document Test Project",
        language="fr",
        owner_user_id="dev-owner"
    )
    store.save(profile)
    pid = profile.project_id

    # Ensure clean state for docs in memory / db
    docs = store.list_documents(pid)
    for d in docs:
        store.delete_document(d["id"])

    # 2. Upload mock documents
    store.save_document(
        doc_id="doc1",
        project_id=pid,
        owner_user_id="dev-owner",
        filename="business_plan.pdf",
        storage_path="/tmp/business_plan.pdf",
        extracted_text="Ceci est le business plan officiel pour AgriTech. Le marché cible est la Tunisie."
    )

    store.save_document(
        doc_id="doc2",
        project_id=pid,
        owner_user_id="dev-owner",
        filename="validation_survey.txt",
        storage_path="/tmp/validation_survey.txt",
        extracted_text="Enquête de validation: 85% des répondants sont intéressés."
    )

    # 3. Call the assistant reply function (async)
    async def run_reply():
        return await grounded_assistant_reply(profile, "Quelles sont les informations clés dans mes documents ?")

    res = asyncio.run(run_reply())

    # 4. Verify grounding context includes document names and content
    grounding = res["grounding"]
    assert "business_plan.pdf" in grounding
    assert "validation_survey.txt" in grounding
    assert "Ceci est le business plan officiel" in grounding
    assert "Enquête de validation" in grounding

    # 5. Clean up
    store.delete_document("doc1")
    store.delete_document("doc2")
    store.delete_project(pid)
