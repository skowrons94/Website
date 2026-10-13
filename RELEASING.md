# Releasing a version (and getting a DOI)

A release is a git tag `vX.Y.Z` on `main`. The site reads it: "How to cite
this site" on /about shows the latest tag's version and the date of its commit
(`lib/site-release.ts`; without a tag it shows `version` from package.json and
`date-released` from CITATION.cff, so the two agree). Tag on the day you set
as `date-released`.

## Every release

1. Decide the number: `X` for a change in what the site is, `Y` for new
   content (a reaction, an evaluation, a page), `Z` for corrections.
2. Set it in three places: `version` in `package.json`, and `version` and
   `date-released` in `CITATION.cff`.
3. Commit, then tag and push:

   ```sh
   git tag -a v1.1.0 -m "v1.1.0"
   git push origin main v1.1.0
   ```

4. On GitHub: Releases → Draft a new release → choose the tag → describe the
   changes → Publish. Once the Zenodo integration below is on, publishing the
   release is what makes Zenodo archive it and mint a DOI for that version.

## Once: the Zenodo DOI

1. Sign in at <https://zenodo.org> with GitHub, open Account → GitHub, and
   switch the repository `skowrons94/Website` on. (The repository must be
   public.)
2. Publish a GitHub release as above. Zenodo reads `.zenodo.json` (title,
   author with ORCID, keywords, related works) and archives the release.
3. On the Zenodo record, find the **concept DOI** ("Cite all versions"): it
   always resolves to the latest version. Put it in `content/profile.yaml`:

   ```yaml
   site_doi: 10.5281/zenodo.1234567
   ```

   It then appears in "How to cite this site" on /about and under the atlas',
   the s-process page's and each evaluation's citation box. While the field
   is empty, no DOI is shown anywhere.
4. Add the same DOI to `CITATION.cff`:

   ```yaml
   identifiers:
     - type: doi
       value: 10.5281/zenodo.1234567
       description: Concept DOI (all versions)
   ```

5. Licence: the repository has no LICENSE file yet. Zenodo asks for one; add
   it to the repository (and as `license:` in CITATION.cff and .zenodo.json)
   before the first archived release. The atlas' texts and data are already
   CC BY 4.0 (`content/atlas/atlas.yaml`).
