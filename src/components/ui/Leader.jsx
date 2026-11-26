/**
 * Leader — the dotted run from a name to its figure.
 *
 *   <span>Sisig</span><Leader /><span className="figure">₱480.00</span>
 *
 * It absorbs all the width left over between the two, which is both the
 * signature mark of this interface and the actual solution to binding a
 * variable-length name to a right-aligned amount. Decorative, so it is
 * hidden from assistive technology — the row already reads "Sisig ₱480.00".
 *
 * Almost always used through <Row>; exported separately only for the places
 * that build an irregular line (a running total, a fee with a caveat).
 */
export default function Leader() {
  return <span className="leader" aria-hidden="true" />;
}
