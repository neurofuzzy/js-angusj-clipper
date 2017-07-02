/*******************************************************************************
 *                                                                              *
 * Author    :  Angus Johnson                                                   *
 * Version   :  6.4.2                                                           *
 * Date      :  27 February 2017                                                *
 * Website   :  http://www.angusj.com                                           *
 * Copyright :  Angus Johnson 2010-2017                                         *
 *                                                                              *
 * License:                                                                     *
 * Use, modification & distribution is subject to Boost Software License Ver 1. *
 * http://www.boost.org/LICENSE_1_0.txt                                         *
 *                                                                              *
 * Attributions:                                                                *
 * The code in this library is an extension of Bala Vatti's clipping algorithm: *
 * "A generic solution to polygon clipping"                                     *
 * Communications of the ACM, Vol 35, Issue 7 (July 1992) pp 56-63.             *
 * http://portal.acm.org/citation.cfm?id=129906                                 *
 *                                                                              *
 * Computer graphics and geometric modeling: implementation and algorithms      *
 * By Max K. Agoston                                                            *
 * Springer; 1 edition (January 4, 2005)                                        *
 * http://books.google.com/books?q=vatti+clipping+agoston                       *
 *                                                                              *
 * See also:                                                                    *
 * "Polygon Offsetting by Computing Winding Numbers"                            *
 * Paper no. DETC2005-85513 pp. 565-575                                         *
 * ASME 2005 International Design Engineering Technical Conferences             *
 * and Computers and Information in Engineering Conference (IDETC/CIE2005)      *
 * September 24-28, 2005 , Long Beach, California, USA                          *
 * http://www.me.berkeley.edu/~mcmains/pubs/DAC05OffsetPolygon.pdf              *
 *                                                                              *
 *******************************************************************************/

/*******************************************************************************
 *                                                                              *
 * Author    :  Javier Gonzalez Garces                                          *
 * Version   :  6.4.2                                                           *
 * Date      :  12 July 2017                                                    *
 *                                                                              *
 * This is a translation of the C# Clipper library to Javascript.               *
 *                                                                              *
 * One change with respect to the original library is that points are assumed   *
 * to be immutable structures. This is done so the algorithm is faster, but if  *
 * you modify a point from the original polygon it might end up modifying the   *
 * result(s).                                                                   *
 *                                                                              *
 * Int128 struct of C# is implemented using js-big-integer                      *
 * Because Javascript lacks support for 64-bit integers, the space              *
 * is a little more restricted than in C# version.                              *
 *                                                                              *
 * C# version has support for coordinate space:                                 *
 * +-4611686018427387903 ( sqrt(2^127 -1)/2 )                                   *
 * while Javascript version has support for space:                              *
 * +-4503599627370495 ( sqrt(2^106 -1)/2 )                                      *
 *                                                                              *
 * js-big-integer proved to be the fastest big integer library for muls:        *
 * http://yaffle.github.io/BigInteger/benchmark/                                *
 *                                                                              *
 * This class can be made simpler when (if ever) 64-bit integer support comes.  *
 *                                                                              *
 *******************************************************************************/

/*******************************************************************************
 *                                                                              *
 * This is a translation of the Delphi Clipper library and the naming style     *
 * used has retained a Delphi flavour.                                          *
 *                                                                              *
 *******************************************************************************/

// NOT AVAILABLE IN JAVASCRIPT SINCE WE WILL USE NUMBERS
//use_int32: When enabled 32bit ints are used instead of 64bit ints. This
//improve performance but coordinate values are limited to the range +/- 46340
//#define use_int32

//use_xyz: adds a Z member to IntPoint. Adds a minor cost to performance.
//const use_xyz = true;
//export type IntPoint = IntPointXYZ;

const use_xyz = false;
export type IntPoint = IntPointXY;

//use_lines: Enables open path clipping. Adds a very minor cost to performance.
const use_lines = true;


// basic types
export type long = number;
export type int = number;
export type double = number;
export type cInt = long;


// enums
export const enum ClipType { ctIntersection, ctUnion, ctDifference, ctXor }
export const enum PolyType { ptSubject, ptClip }

//By far the most widely used winding rules for polygon filling are
//EvenOdd & NonZero (GDI, GDI+, XLib, OpenGL, Cairo, AGG, Quartz, SVG, Gr32)
//Others rules include Positive, Negative and ABS_GTR_EQ_TWO (only in OpenGL)
//see http://glprogramming.com/red/chapter11.html
export const enum PolyFillType { pftEvenOdd, pftNonZero, pftPositive, pftNegative }

export const enum JoinType { jtSquare, jtRound, jtMiter }
export const enum EndType { etClosedPolygon, etClosedLine, etOpenButt, etOpenSquare, etOpenRound }

export const enum EdgeSide {esLeft, esRight} // internal
const enum Direction {dRightToLeft, dLeftToRight} // internal

const enum NodeType { ntAny, ntOpen, ntClosed } // internal


// big int
const BigInteger = require('BigInteger').BigInteger;
const Int128Mul = (a: any, b: any): any => {
  return BigInteger.multiply(a, b);
};
const Int128Equals = (a: any, b: any): boolean => {
  return BigInteger.compareTo(a, b) === 0;
};


// points, assumed to be immutable for speed
export interface IntPointXY {
  readonly X: cInt;
  readonly Y: cInt;
}

export interface IntPointXYZ extends IntPointXY {
  readonly Z: cInt;
}

const newIntPointXY = (X: cInt, Y: cInt): IntPointXY => {
  return {
    X: X,
    Y: Y,
  };
};

const newIntPointXYZ = (X: cInt, Y: cInt, Z: cInt = 0): IntPointXYZ => {
  return {
    X: X,
    Y: Y,
    Z: Z,
  };
};

const newIntPoint = use_xyz ? newIntPointXYZ : newIntPointXY;
const emptyIntPoint = newIntPoint(0, 0);

const intPointEqualsXY = (a: IntPointXY, b: IntPointXY) => {
  // if using XY we can just compare by reference, since they are immutable
  return a === b;
};

const intPointEqualsXYZ = (a: IntPointXY | IntPointXYZ, b: IntPointXY | IntPointXYZ) => {
  // yes, we don't compare Z (that's why we can't use immutable comparison) TODO: or can we?
  return (a === b) || (a.X === b.X && a.Y === b.Y);
};

const intPointEquals = use_xyz ? intPointEqualsXYZ : intPointEqualsXY;

// TODO: remove, right now only for reference for when points were mutable
const cloneIntPoint = (pt: IntPoint): IntPoint => pt;

const cloneIntPointXYWithX = (p: IntPointXY, x: cInt): IntPointXY => {
  return {
    X: x,
    Y: p.Y
  };
};

const cloneIntPointXYZWithX = (p: IntPointXYZ, x: cInt): IntPointXYZ => {
  return {
    X: x,
    Y: p.Y,
    Z: p.Z
  };
};

const cloneIntPointWithX = use_xyz ? cloneIntPointXYZWithX : cloneIntPointXYWithX;


// rects
export interface IntRect { // struct
  left: cInt;
  top: cInt;
  right: cInt;
  bottom: cInt;
}


// paths
export type Path = IntPoint[];
export type Paths = Path[];


//------------------------------------------------------------------------------
// PolyTree & PolyNode classes
//------------------------------------------------------------------------------

export class PolyNode {
  m_Parent?: PolyNode; // internal, can be undefined
  m_polygon: Path = []; // internal
  private m_Index: int = 0; // internal
  m_jointype: JoinType = JoinType.jtSquare; // internal
  m_endtype: EndType = EndType.etClosedPolygon; // internal
  m_Childs: PolyNode[] = []; // internal

  private IsHoleNode(): boolean {
    let result = true;
    let node: PolyNode | undefined = this.m_Parent;
    while (node !== undefined) {
      result = !result;
      node = node.m_Parent;
    }
    return result;
  }

  public get ChildCount(): int {
    return this.m_Childs.length;
  }

  public get Contour(): Path {
    return this.m_polygon;
  }

  AddChild(Child: PolyNode): void { // internal
    const cnt: int = this.m_Childs.length;
    this.m_Childs.push(Child);
    Child.m_Parent = this;
    Child.m_Index = cnt;
  }

  public GetNext(): PolyNode | undefined {
    if (this.m_Childs.length > 0)
      return this.m_Childs[0];
    else
      return this.GetNextSiblingUp();
  }

  private GetNextSiblingUp(): PolyNode | undefined {
    if (this.m_Parent === undefined)
      return undefined;
    else if (this.m_Index === this.m_Parent.m_Childs.length - 1) {
      //noinspection TailRecursionJS
      return this.m_Parent.GetNextSiblingUp();
    }
    else
      return this.m_Parent.m_Childs[this.m_Index + 1];
  }

  public get Childs(): PolyNode[] {
    return this.m_Childs;
  }

  public get Parent(): PolyNode | undefined {
    return this.m_Parent;
  }

  public get IsHole(): boolean {
    return this.IsHoleNode();
  }

  public IsOpen: boolean = false;
}

export class PolyTree extends PolyNode {
  m_AllPolys: (PolyNode | undefined)[] = []; // internal

  //The GC probably handles this cleanup more efficiently ...
  //~PolyTree(){Clear();}

  public Clear(): void {
    for (let i = 0; i < this.m_AllPolys.length; i++) {
      this.m_AllPolys[i] = undefined;
    }
    this.m_AllPolys.length = 0;
    this.m_Childs.length = 0;
  }

  public GetFirst(): PolyNode | undefined {
    if (this.m_Childs.length > 0)
      return this.m_Childs[0];
    else
      return undefined;
  }

  public get Total(): int {
    let result = this.m_AllPolys.length;
    //with negative offsets, ignore the hidden outer polygon ...
    if (result > 0 && this.m_Childs[0] !== this.m_AllPolys[0]) result--;
    return result;
  }
}


export class TEdge { // internal
  Bot: IntPoint = emptyIntPoint;
  Curr: IntPoint = emptyIntPoint; //current (updated for every new scanbeam)
  Top: IntPoint = emptyIntPoint;
  Delta: IntPoint = emptyIntPoint;
  Dx: double = 0;
  PolyTyp: PolyType = PolyType.ptSubject;
  Side: EdgeSide = EdgeSide.esLeft; //side only refers to current side of solution poly
  WindDelta: int = 0; //1 or -1 depending on winding direction
  WindCnt: int = 0;
  WindCnt2: int = 0; //winding count of the opposite polytype
  OutIdx: int = 0;
  Next: TEdge; // cannot be undefined
  Prev?: TEdge; // can be undefined
  NextInLML?: TEdge; // can be undefined
  NextInAEL?: TEdge; // can be undefined
  PrevInAEL?: TEdge; // can be undefined
  NextInSEL?: TEdge; // can be undefined
  PrevInSEL?: TEdge; // can be undefined
}

export class IntersectNode {
  Edge1: TEdge; // internal, cant be undefined
  Edge2: TEdge; // internal, cant be undefined
  Pt: IntPoint = emptyIntPoint; // internal
}

export type IntersectNodeComparer = (node1: IntersectNode, node2: IntersectNode) => int;
const MyIntersectNodeSort: IntersectNodeComparer = (node1: IntersectNode, node2: IntersectNode): int => {
  const i: cInt = node2.Pt.Y - node1.Pt.Y;
  if (i > 0) return 1;
  else if (i < 0) return -1;
  else return 0;
};

export class LocalMinima { // internal
  Y: cInt = 0;
  LeftBound?: TEdge; // can be undefined
  RightBound?: TEdge; // can be undefined
  Next?: LocalMinima; // can be undefined
}

export class Scanbeam { // internal
  Y: cInt = 0;
  Next?: Scanbeam; // can be undefined
}

class Maxima { // internal
  X: cInt = 0;
  Next?: Maxima; // can be undefined
  Prev?: Maxima; // can be undefined
}

//OutRec: contains a path in the clipping solution. Edges in the AEL will
//carry a pointer to an OutRec when they are part of the clipping solution.
export class OutRec { // internal
  Idx: int = 0;
  IsHole: boolean = false;
  IsOpen: boolean = false;
  FirstLeft?: OutRec; // can be undefined //see comments in clipper.pas
  Pts?: OutPt; // can be undefined
  BottomPt?: OutPt; // can be undefined
  PolyNode?: PolyNode; // can be undefined
}

export class OutPt { // internal
  Idx: int = 0;
  Pt: IntPoint = emptyIntPoint;
  Next: OutPt; // cannot be undefined
  Prev: OutPt; // cannot be undefined
}

class Join { // internal
  OutPt1: OutPt; // cannot be undefined
  OutPt2: OutPt; // cannot be undefined
  OffPt: IntPoint = emptyIntPoint;
}

export class ClipperError extends Error {
  constructor(public message: string) {
    super(message);
    Object.setPrototypeOf(this, ClipperError.prototype);
    this.name = this.constructor.name;
    this.stack = (new Error()).stack;
  }
}


// helper methods

const Round = (value: double): long => {
  // TODO: simply use Math.round? although Math.round(-0.5) = 0- and Math.round(0.5) = 1
  return value < 0 ? Math.trunc(value - 0.5) : Math.trunc(value + 0.5);
};

const TopX = (edge: TEdge, currentY: long) => {
  if (currentY === edge.Top.Y) {
    return edge.Top.X;
  }
  return edge.Bot.X + Round(edge.Dx * (currentY - edge.Bot.Y));
};

// ClipperBase

const tolerance: double = 1.0E-20; // internal

// ranges in c# are too high for JS
//const horizontal: double = -3.4E+38;
//export const loRange: cInt = 0x3FFFFFFF; // = 1073741823 = sqrt(2^63 -1)/2
//export const hiRange: cInt = 0x3FFFFFFFFFFFFFFF; // = 4611686018427387903 = sqrt(2^127 -1)/2
const horizontal: double = -9007199254740992; //-2^53
export const loRange: cInt = 47453132; // sqrt(2^53 -1)/2
export const hiRange: cInt = 4503599627370495; // sqrt(2^106 -1)/2
// if JS ever supports true 64-bit integers then these ranges can be as in C#
// and the biginteger library can be simpler, as then 128bit can be represented as two 64bit numbers

const Skip: int = -2;
const Unassigned: int = -1;

const near_zero = (val: double) => {
  return (val > -tolerance) && (val < tolerance);
};

export class ClipperBase {
  private m_MinimaList?: LocalMinima;
  private m_CurrentLM?: LocalMinima;
  private m_edges: (TEdge | undefined)[][] = [];
  protected m_Scanbeam?: Scanbeam;
  protected m_PolyOuts: (OutRec | undefined)[] = [];
  protected m_ActiveEdges?: TEdge;
  protected m_UseFullRange: boolean = false;
  protected m_HasOpenPaths: boolean = false;

  public PreserveCollinear: boolean = false;

  protected static IsHorizontal(e: TEdge): boolean {
    return e.Delta.Y === 0;
  }

  //noinspection JSUnusedLocalSymbols
  private static PointIsVertex(pt: IntPoint, pp: OutPt): boolean { // unused in the original
    let pp2: OutPt | undefined = pp;
    do {
      if (intPointEquals(pp2!.Pt, pt)) return true;
      pp2 = pp2!.Next;
    } while (pp2 !== pp);

    return false;
  }

  private static PointOnLineSegment(pt: IntPoint, linePt1: IntPoint, linePt2: IntPoint, UseFullRange: boolean): boolean {
    if (UseFullRange) {
      return (
        ((pt.X === linePt1.X) && (pt.Y === linePt1.Y)) ||
        ((pt.X === linePt2.X) && (pt.Y === linePt2.Y)) ||
        (
          ((pt.X > linePt1.X) === (pt.X < linePt2.X)) &&
          ((pt.Y > linePt1.Y) === (pt.Y < linePt2.Y)) &&
          (
            Int128Equals(
              Int128Mul((pt.X - linePt1.X), (linePt2.Y - linePt1.Y)),
              Int128Mul((linePt2.X - linePt1.X), (pt.Y - linePt1.Y))
            )
          )
        )
      );
    }
    else {
      return (
        ((pt.X === linePt1.X) && (pt.Y === linePt1.Y)) ||
        ((pt.X === linePt2.X) && (pt.Y === linePt2.Y)) ||
        (
          ((pt.X > linePt1.X) === (pt.X < linePt2.X)) &&
          ((pt.Y > linePt1.Y) === (pt.Y < linePt2.Y)) &&
          (
            (pt.X - linePt1.X) * (linePt2.Y - linePt1.Y) === (linePt2.X - linePt1.X) * (pt.Y - linePt1.Y)
          )
        )
      );
    }
  }

  //noinspection JSUnusedLocalSymbols
  private static PointOnPolygon(pt: IntPoint, pp: OutPt, UseFullRange: boolean): boolean { // unused in the original
    let pp2: OutPt | undefined = pp;
    while (true) {
      if (ClipperBase.PointOnLineSegment(pt, pp2!.Pt, pp2!.Next.Pt, UseFullRange)) {
        return true;
      }
      pp2 = pp2!.Next;
      if (pp2 === pp) break;
    }
    return false;
  }

  protected static EdgeSlopesEqual(e1: TEdge, e2: TEdge, UseFullRange: boolean): boolean {
    if (UseFullRange) {
      return Int128Equals(Int128Mul(e1.Delta.Y, e2.Delta.X), Int128Mul(e1.Delta.X, e2.Delta.Y));
    }
    else {
      return (e1.Delta.Y) * (e2.Delta.X) === (e1.Delta.X) * (e2.Delta.Y);
    }
  }

  protected static IntPoint3SlopesEqual(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint, UseFullRange: boolean): boolean {
    if (UseFullRange) {
      return Int128Equals(Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X), Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y));
    }
    else {
      return (pt1.Y - pt2.Y) * (pt2.X - pt3.X) - (pt1.X - pt2.X) * (pt2.Y - pt3.Y) === 0;
    }
  }

  protected static IntPoint4SlopesEqual(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint, pt4: IntPoint, UseFullRange: boolean) {
    if (UseFullRange) {
      return Int128Equals(Int128Mul(pt1.Y - pt2.Y, pt3.X - pt4.X), Int128Mul(pt1.X - pt2.X, pt3.Y - pt4.Y));
    }
    else {
      return (pt1.Y - pt2.Y) * (pt3.X - pt4.X) - (pt1.X - pt2.X) * (pt3.Y - pt4.Y) === 0;
    }
  }

  protected constructor() {
    this.m_MinimaList = undefined;
    this.m_CurrentLM = undefined;
    this.m_UseFullRange = false;
    this.m_HasOpenPaths = false;
  }

  public Clear(): void { // virtual
    this.DisposeLocalMinimaList();
    for (let i: int = 0; i < this.m_edges.length; ++i) {
      for (let j: int = 0; j < this.m_edges[i].length; ++j) this.m_edges[i][j] = undefined;
      this.m_edges[i].length = 0;
    }
    this.m_edges.length = 0;
    this.m_UseFullRange = false;
    this.m_HasOpenPaths = false;
  }

  private DisposeLocalMinimaList(): void {
    while (this.m_MinimaList !== undefined ) {
      const tmpLm: LocalMinima | undefined = this.m_MinimaList.Next;
      this.m_MinimaList = undefined;
      this.m_MinimaList = tmpLm;
    }
    this.m_CurrentLM = undefined;
  }

  private static RangeTestNoRef(Pt: IntPoint, useFullRange: boolean): boolean { // ref useFullRange -> in useFullRange: useFullRange
    if (useFullRange) {
      if (Pt.X > hiRange || Pt.Y > hiRange || -Pt.X > hiRange || -Pt.Y > hiRange) throw new ClipperError('Coordinate outside allowed range');
    }
    else if (Pt.X > loRange || Pt.Y > loRange || -Pt.X > loRange || -Pt.Y > loRange) {
      useFullRange = true;
      useFullRange = ClipperBase.RangeTestNoRef(Pt, useFullRange);
    }
    return useFullRange;
  }

  private static InitEdge(e: TEdge, eNext: TEdge, ePrev: TEdge, pt: IntPoint): void {
    e.Next = eNext;
    e.Prev = ePrev;
    e.Curr = cloneIntPoint(pt);
    e.OutIdx = Unassigned;
  }

  private static InitEdge2(e: TEdge, polyType: PolyType): void {
    if (e.Curr.Y >= e.Next.Curr.Y) {
      e.Bot = cloneIntPoint(e.Curr);
      e.Top = cloneIntPoint(e.Next.Curr);
    }
    else {
      e.Top = cloneIntPoint(e.Curr);
      e.Bot = cloneIntPoint(e.Next.Curr);
    }
    ClipperBase.SetDx(e);
    e.PolyTyp = polyType;
  }

  private static FindNextLocMin(e: TEdge | undefined): TEdge | undefined {
    let E: TEdge | undefined = e;
    let E2: TEdge | undefined;
    while (true) {
      while (!intPointEquals(E!.Bot, E!.Prev!.Bot) || intPointEquals(E!.Curr, E!.Top)) E = E!.Next;
      if (E!.Dx !== horizontal && E!.Prev!.Dx !== horizontal) break;
      while (E!.Prev!.Dx === horizontal) E = E!.Prev;
      E2 = E;
      while (E!.Dx === horizontal) E = E!.Next;
      if (E!.Top.Y === E!.Prev!.Bot.Y) continue; //ie just an intermediate horz.
      if (E2!.Prev!.Bot.X < E!.Bot.X) E = E2;
      break;
    }
    return E;
  }

  private ProcessBound(e: TEdge, LeftBoundIsForward: boolean): TEdge | undefined {
    let E: TEdge | undefined = e;
    let EStart: TEdge | undefined, Result: TEdge | undefined = E;
    let Horz: TEdge | undefined;

    if (Result.OutIdx === Skip) {
      //check if there are edges beyond the skip edge in the bound and if so
      //create another LocMin and calling ProcessBound once more ...
      E = Result;
      if (LeftBoundIsForward) {
        while (E!.Top.Y === E!.Next.Bot.Y) E = E!.Next;
        while (E !== Result && E!.Dx === horizontal) E = E!.Prev;
      }
      else {
        while (E!.Top.Y === E!.Prev!.Bot.Y) E = E!.Prev;
        while (E !== Result && E!.Dx === horizontal) E = E!.Next;
      }
      if (E === Result) {
        if (LeftBoundIsForward) Result = E.Next;
        else Result = E.Prev;
      }
      else {
        //there are more edges in the bound beyond result starting with E
        if (LeftBoundIsForward)
          E = Result.Next;
        else
          E = Result.Prev;
        const locMin: LocalMinima = new LocalMinima();
        locMin.Next = undefined;
        locMin.Y = E!.Bot.Y;
        locMin.LeftBound = undefined;
        locMin.RightBound = E;
        E!.WindDelta = 0;
        Result = this.ProcessBound(E!, LeftBoundIsForward);
        this.InsertLocalMinima(locMin);
      }
      return Result;
    }

    if (E.Dx === horizontal) {
      //We need to be careful with open paths because this may not be a
      //true local minima (ie E may be following a skip edge).
      //Also, consecutive horz. edges may start heading left before going right.
      if (LeftBoundIsForward) EStart = E.Prev;
      else EStart = E.Next;
      if (EStart!.Dx === horizontal) { //ie an adjoining horizontal skip edge
        if (EStart!.Bot.X !== E.Bot.X && EStart!.Top.X !== E.Bot.X)
          ClipperBase.ReverseHorizontal(E);
      }
      else if (EStart!.Bot.X !== E.Bot.X)
        ClipperBase.ReverseHorizontal(E);
    }

    EStart = E;
    if (LeftBoundIsForward) {
      while (Result!.Top.Y === Result!.Next.Bot.Y && Result!.Next.OutIdx !== Skip)
        Result = Result!.Next;
      if (Result!.Dx === horizontal && Result!.Next.OutIdx !== Skip) {
        //nb: at the top of a bound, horizontals are added to the bound
        //only when the preceding edge attaches to the horizontal's left vertex
        //unless a Skip edge is encountered when that becomes the top divide
        Horz = Result;
        while (Horz!.Prev!.Dx === horizontal) Horz = Horz!.Prev;
        if (Horz!.Prev!.Top.X > Result!.Next.Top.X) Result = Horz!.Prev;
      }
      while (E !== Result) {
        E!.NextInLML = E!.Next;
        if (E!.Dx === horizontal && E !== EStart && E!.Bot.X !== E!.Prev!.Top.X)
          ClipperBase.ReverseHorizontal(E!);
        E = E!.Next;
      }
      if (E!.Dx === horizontal && E !== EStart && E!.Bot.X !== E!.Prev!.Top.X)
        ClipperBase.ReverseHorizontal(E!);
      Result = Result!.Next; //move to the edge just beyond current bound
    }
    else {
      while (Result!.Top.Y === Result!.Prev!.Bot.Y && Result!.Prev!.OutIdx !== Skip)
        Result = Result!.Prev;
      if (Result!.Dx === horizontal && Result!.Prev!.OutIdx !== Skip) {
        Horz = Result;
        while (Horz!.Next.Dx === horizontal) Horz = Horz!.Next;
        if (Horz!.Next.Top.X === Result!.Prev!.Top.X ||
          Horz!.Next.Top.X > Result!.Prev!.Top.X) Result = Horz!.Next;
      }

      while (E !== Result) {
        E!.NextInLML = E!.Prev;
        if (E!.Dx === horizontal && E !== EStart && E!.Bot.X !== E!.Next.Top.X)
          ClipperBase.ReverseHorizontal(E!);
        E = E!.Prev;
      }
      if (E!.Dx === horizontal && E !== EStart && E!.Bot.X !== E!.Next.Top.X)
        ClipperBase.ReverseHorizontal(E!);
      Result = Result!.Prev; //move to the edge just beyond current bound
    }
    return Result;
  }

  public AddPath(pg: Path, polyType: PolyType, Closed: boolean): boolean {
    if (use_lines) {
      if (!Closed && polyType === PolyType.ptClip)
        throw new ClipperError('AddPath: Open paths must be subject.');
    }
    else {
      if (!Closed)
        throw new ClipperError('AddPath: Open paths have been disabled.');
    }

    let highI: int = pg.length - 1;
    if (Closed) while (highI > 0 && intPointEquals(pg[highI], pg[0])) --highI;
    while (highI > 0 && intPointEquals(pg[highI], pg[highI - 1])) --highI;
    if ((Closed && highI < 2) || (!Closed && highI < 1)) return false;

    //create a new edge array ...
    const edges: TEdge[] = []; // new List<TEdge>(highI+1);
    edges.length = highI + 1;
    for (let i: int = 0; i <= highI; i++) edges[i] = new TEdge();

    let IsFlat: boolean = true;

    //1. Basic (first) edge initialization ...
    edges[1].Curr = cloneIntPoint(pg[1]);
    this.m_UseFullRange = ClipperBase.RangeTestNoRef(pg[0], this.m_UseFullRange);
    this.m_UseFullRange = ClipperBase.RangeTestNoRef(pg[highI], this.m_UseFullRange);
    ClipperBase.InitEdge(edges[0], edges[1], edges[highI], pg[0]);
    ClipperBase.InitEdge(edges[highI], edges[0], edges[highI - 1], pg[highI]);
    for (let i: int = highI - 1; i >= 1; --i) {
      this.m_UseFullRange = ClipperBase.RangeTestNoRef(pg[i], this.m_UseFullRange);
      ClipperBase.InitEdge(edges[i], edges[i + 1], edges[i - 1], pg[i]);
    }
    let eStart: TEdge | undefined = edges[0];

    //2. Remove duplicate vertices, and (when closed) collinear edges ...
    let E: TEdge | undefined = eStart, eLoopStop: TEdge | undefined = eStart;
    while (true) {
      //nb: allows matching start and end points when not Closed ...
      if (intPointEquals(E!.Curr, E!.Next.Curr) && (Closed || E!.Next !== eStart)) {
        if (E === E!.Next) break;
        if (E === eStart) eStart = E!.Next;
        E = ClipperBase.RemoveEdge(E!);
        eLoopStop = E;
        continue;
      }
      if (E!.Prev === E!.Next)
        break; //only two vertices
      else if (
        Closed &&
        ClipperBase.IntPoint3SlopesEqual(E!.Prev!.Curr, E!.Curr, E!.Next.Curr, this.m_UseFullRange) &&
        (
          !this.PreserveCollinear || !ClipperBase.Pt2IsBetweenPt1AndPt3(E!.Prev!.Curr, E!.Curr, E!.Next.Curr))
      ) {
        //Collinear edges are allowed for open paths but in closed paths
        //the default is to merge adjacent collinear edges into a single edge.
        //However, if the PreserveCollinear property is enabled, only overlapping
        //collinear edges (ie spikes) will be removed from closed paths.
        if (E === eStart) eStart = E!.Next;
        E = ClipperBase.RemoveEdge(E!);
        E = E!.Prev;
        eLoopStop = E;
        continue;
      }
      E = E!.Next;
      if ((E === eLoopStop) || (!Closed && E!.Next === eStart)) break;
    }

    if ((!Closed && (E === E!.Next)) || (Closed && (E!.Prev === E!.Next)))
      return false;

    if (!Closed) {
      this.m_HasOpenPaths = true;
      eStart!.Prev!.OutIdx = Skip;
    }

    //3. Do second stage of edge initialization ...
    E = eStart;
    do {
      ClipperBase.InitEdge2(E!, polyType);
      E = E!.Next;
      if (IsFlat && E!.Curr.Y !== eStart!.Curr.Y) IsFlat = false;
    }
    while (E !== eStart);

    //4. Finally, add edge bounds to LocalMinima list ...

    //Totally flat paths must be handled differently when adding them
    //to LocalMinima list to avoid endless loops etc ...
    if (IsFlat) {
      if (Closed) return false;
      E!.Prev!.OutIdx = Skip;
      const locMin: LocalMinima = new LocalMinima();
      locMin.Next = undefined;
      locMin.Y = E!.Bot.Y;
      locMin.LeftBound = undefined;
      locMin.RightBound = E;
      locMin.RightBound!.Side = EdgeSide.esRight;
      locMin.RightBound!.WindDelta = 0;
      while (true) {
        if (E!.Bot.X !== E!.Prev!.Top.X) ClipperBase.ReverseHorizontal(E!);
        if (E!.Next.OutIdx === Skip) break;
        E!.NextInLML = E!.Next;
        E = E!.Next;
      }
      this.InsertLocalMinima(locMin);
      this.m_edges.push(edges);
      return true;
    }

    this.m_edges.push(edges);
    let leftBoundIsForward: boolean = false;
    let EMin: TEdge | undefined;

    //workaround to avoid an endless loop in the while loop below when
    //open paths have matching start and end points ...
    if (intPointEquals(E!.Prev!.Bot, E!.Prev!.Top)) E = E!.Next;

    while (true) {
      E = ClipperBase.FindNextLocMin(E);
      if (E === EMin) break;
      else if (EMin === undefined) EMin = E;

      //E and E.Prev now share a local minima (left aligned if horizontal).
      //Compare their slopes to find which starts which bound ...
      const locMin: LocalMinima = new LocalMinima();
      locMin.Next = undefined;
      locMin.Y = E!.Bot.Y;
      if (E!.Dx < E!.Prev!.Dx) {
        locMin.LeftBound = E!.Prev;
        locMin.RightBound = E;
        leftBoundIsForward = false; //Q.nextInLML = Q.prev
      }
      else {
        locMin.LeftBound = E;
        locMin.RightBound = E!.Prev;
        leftBoundIsForward = true; //Q.nextInLML = Q.next
      }
      locMin.LeftBound!.Side = EdgeSide.esLeft;
      locMin.RightBound!.Side = EdgeSide.esRight;

      if (!Closed) locMin.LeftBound!.WindDelta = 0;
      else if (locMin.LeftBound!.Next === locMin.RightBound)
        locMin.LeftBound!.WindDelta = -1;
      else
        locMin.LeftBound!.WindDelta = 1;
      locMin.RightBound!.WindDelta = -locMin.LeftBound!.WindDelta;

      E = this.ProcessBound(locMin.LeftBound!, leftBoundIsForward);
      if (E!.OutIdx === Skip) E = this.ProcessBound(E!, leftBoundIsForward);

      let E2: TEdge | undefined = this.ProcessBound(locMin.RightBound!, !leftBoundIsForward);
      if (E2!.OutIdx === Skip) E2 = this.ProcessBound(E2!, !leftBoundIsForward);

      if (locMin.LeftBound!.OutIdx === Skip)
        locMin.LeftBound = undefined;
      else if (locMin.RightBound!.OutIdx === Skip)
        locMin.RightBound = undefined;
      this.InsertLocalMinima(locMin);
      if (!leftBoundIsForward) E = E2;
    }
    return true;
  }

  public AddPaths(ppg: Paths, polyType: PolyType, closed: boolean): boolean {
    let result: boolean = false;
    for (let i: int = 0; i < ppg.length; ++i) {
      if (this.AddPath(ppg[i], polyType, closed))
        result = true;
    }
    return result;
  }

  protected static Pt2IsBetweenPt1AndPt3(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint): boolean {
    if (intPointEquals(pt1, pt3) || intPointEquals(pt1, pt2) || intPointEquals(pt3, pt2)) return false;
    else if (pt1.X !== pt3.X) return (pt2.X > pt1.X) === (pt2.X < pt3.X);
    else return (pt2.Y > pt1.Y) === (pt2.Y < pt3.Y);
  }

  private static RemoveEdge(e: TEdge): TEdge | undefined {
    //removes e from double_linked_list (but without removing from memory)
    e.Prev!.Next = e.Next;
    e.Next.Prev = e.Prev;
    const result = e.Next;
    e.Prev = undefined; //flag as removed (see ClipperBase.Clear)
    return result;
  }

  private static SetDx(e: TEdge): void {
    e.Delta = newIntPoint((e.Top.X - e.Bot.X), (e.Top.Y - e.Bot.Y));
    if (e.Delta.Y === 0) e.Dx = horizontal;
    else e.Dx = (e.Delta.X) / (e.Delta.Y);
  }

  private InsertLocalMinima(newLm: LocalMinima): void {
    if (this.m_MinimaList === undefined ) {
      this.m_MinimaList = newLm;
    }
    else if (newLm.Y >= this.m_MinimaList.Y) {
      newLm.Next = this.m_MinimaList;
      this.m_MinimaList = newLm;
    }
    else {
      let tmpLm: LocalMinima | undefined = this.m_MinimaList;
      while (tmpLm.Next !== undefined && (newLm.Y < tmpLm.Next.Y))
        tmpLm = tmpLm.Next;
      newLm.Next = tmpLm.Next;
      tmpLm.Next = newLm;
    }
  }

  protected PopLocalMinimaNoOut(Y: cInt): {res: boolean, current: LocalMinima | undefined} { // out current: boolean -> { res, current }
    const current: LocalMinima | undefined = this.m_CurrentLM;
    if (this.m_CurrentLM !== undefined && this.m_CurrentLM.Y === Y) {
      this.m_CurrentLM = this.m_CurrentLM.Next;
      return { res: true, current: current };
    }
    return { res: false, current: current };
  }

  private static ReverseHorizontal(e: TEdge): void {
    //swap horizontal edges' top and bottom x's so they follow the natural
    //progression of the bounds - ie so their xbots will align with the
    //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]

    if (use_xyz) {
      const topZ = (e.Bot as IntPointXYZ).Z;
      const botZ = (e.Top as IntPointXYZ).Z;

      e.Top = newIntPointXYZ(e.Bot.X, e.Top.Y, topZ);
      e.Bot = newIntPointXYZ(e.Top.X, e.Bot.Y, botZ);
    }
    else {
      e.Top = newIntPointXY(e.Bot.X, e.Top.Y);
      e.Bot = newIntPointXY(e.Top.X, e.Bot.Y);
    }

    // changed the function that mutates points to another that doesn't
    /*
    const tmpx = e.Top.X;
    e.Top.X = e.Bot.X;
    e.Bot.X = tmpx;

    if (use_xyz) {
      const tmpz = (e.Top as IntPointXYZ).Z;
      (e.Top as IntPointXYZ).Z = (e.Bot as IntPointXYZ).Z;
      (e.Bot as IntPointXYZ).Z = tmpz;
    }*/
  }

  protected Reset(): void { // virtual
    this.m_CurrentLM = this.m_MinimaList;
    if (this.m_CurrentLM === undefined)
      return; //ie nothing to process

    //reset all edges ...
    this.m_Scanbeam = undefined;
    let lm: LocalMinima | undefined = this.m_MinimaList;
    while (lm !== undefined) {
      this.InsertScanbeam(lm.Y);
      let e: TEdge | undefined = lm.LeftBound;
      if (e !== undefined) {
        e.Curr = cloneIntPoint(e.Bot);
        e.OutIdx = Unassigned;
      }
      e = lm.RightBound;
      if (e !== undefined) {
        e.Curr = cloneIntPoint(e.Bot);
        e.OutIdx = Unassigned;
      }
      lm = lm.Next;
    }
    this.m_ActiveEdges = undefined;
  }

  public static GetBounds(paths: Paths): IntRect {
    let i: int = 0;
    const cnt: int = paths.length;
    while (i < cnt && paths[i].length === 0)
      i++;

    const result: IntRect = {left: 0, top: 0, bottom: 0, right: 0};
    if (i === cnt)
      return result;

    result.left = paths[i][0].X;
    result.right = result.left;
    result.top = paths[i][0].Y;
    result.bottom = result.top;
    for (; i < cnt; i++) {
      for (let j: int = 0; j < paths[i].length; j++) {
        if (paths[i][j].X < result.left)
          result.left = paths[i][j].X;
        else if (paths[i][j].X > result.right)
          result.right = paths[i][j].X;
        if (paths[i][j].Y < result.top)
          result.top = paths[i][j].Y;
        else if (paths[i][j].Y > result.bottom)
          result.bottom = paths[i][j].Y;
      }
    }
    return result;
  }

  protected InsertScanbeam(Y: long): void {
    //single-linked list: sorted descending, ignoring dups.
    if (this.m_Scanbeam === undefined) {
      this.m_Scanbeam = new Scanbeam();
      this.m_Scanbeam.Next = undefined;
      this.m_Scanbeam.Y = Y;
    }
    else if (Y > this.m_Scanbeam.Y) {
      const newSb: Scanbeam = new Scanbeam();
      newSb.Y = Y;
      newSb.Next = this.m_Scanbeam;
      this.m_Scanbeam = newSb;
    }
    else {
      let sb2: Scanbeam = this.m_Scanbeam;
      while (sb2.Next !== undefined && Y <= sb2.Next.Y) {
        sb2 = sb2.Next;
      }
      if (Y === sb2.Y) {
        return; //ie ignores duplicates
      }
      const newSb = new Scanbeam();
      newSb.Y = Y;
      newSb.Next = sb2.Next;
      sb2.Next = newSb;
    }
  }

  protected PopScanbeamNoOut(): { res: boolean, Y: long} { // out y: boolean -> { res, y }
    if (this.m_Scanbeam === undefined) {
      return { res: false, Y: 0};
    }
    const Y = this.m_Scanbeam.Y;
    this.m_Scanbeam = this.m_Scanbeam.Next;
    return { res: true, Y: Y};
  }

  protected LocalMinimaPending(): boolean {
    return this.m_CurrentLM !== undefined;
  }

  protected CreateOutRec(): OutRec {
    const result = new OutRec();
    result.Idx = Unassigned;
    result.IsHole = false;
    result.IsOpen = false;
    result.FirstLeft = undefined;
    result.Pts = undefined;
    result.BottomPt = undefined;
    result.PolyNode = undefined;
    this.m_PolyOuts.push(result);
    result.Idx = this.m_PolyOuts.length - 1;
    return result;
  }

  protected DisposeOutRec(index: int): void {
    let outRec: OutRec | undefined = this.m_PolyOuts[index];
    outRec!.Pts = undefined;
    outRec = undefined;
    this.m_PolyOuts[index] = undefined;
  }

  protected UpdateEdgeIntoAELNoRef(e: TEdge): TEdge { // ref e -> in e: e
    if (e.NextInLML === undefined) {
      throw new ClipperError('UpdateEdgeIntoAEL: invalid call');
    }
    const AelPrev = e.PrevInAEL;
    const AelNext = e.NextInAEL;
    e.NextInLML.OutIdx = e.OutIdx;
    if (AelPrev !== undefined) {
      AelPrev.NextInAEL = e.NextInLML;
    }
    else {
      this.m_ActiveEdges = e.NextInLML;
    }
    if (AelNext !== undefined) {
      AelNext.PrevInAEL = e.NextInLML;
    }
    e.NextInLML.Side = e.Side;
    e.NextInLML.WindDelta = e.WindDelta;
    e.NextInLML.WindCnt = e.WindCnt;
    e.NextInLML.WindCnt2 = e.WindCnt2;
    e = e.NextInLML;
    e.Curr = cloneIntPoint(e.Bot);
    e.PrevInAEL = AelPrev;
    e.NextInAEL = AelNext;
    if (!ClipperBase.IsHorizontal(e)) {
      this.InsertScanbeam(e.Top.Y);
    }
    return e;
  }

  protected SwapPositionsInAEL(edge1: TEdge, edge2: TEdge): void {
    //check that one or other edge hasn't already been removed from AEL ...
    if (edge1.NextInAEL === edge1.PrevInAEL ||
      edge2.NextInAEL === edge2.PrevInAEL) {
      return;
    }

    if (edge1.NextInAEL === edge2) {
      const next = edge2.NextInAEL;
      if (next !== undefined) {
        next.PrevInAEL = edge1;
      }
      const prev = edge1.PrevInAEL;
      if (prev !== undefined) {
        prev.NextInAEL = edge2;
      }
      edge2.PrevInAEL = prev;
      edge2.NextInAEL = edge1;
      edge1.PrevInAEL = edge2;
      edge1.NextInAEL = next;
    }
    else if (edge2.NextInAEL === edge1) {
      const next = edge1.NextInAEL;
      if (next !== undefined) {
        next.PrevInAEL = edge2;
      }
      const prev = edge2.PrevInAEL;
      if (prev !== undefined) {
        prev.NextInAEL = edge1;
      }
      edge1.PrevInAEL = prev;
      edge1.NextInAEL = edge2;
      edge2.PrevInAEL = edge1;
      edge2.NextInAEL = next;
    }
    else {
      const next = edge1.NextInAEL;
      const prev = edge1.PrevInAEL;
      edge1.NextInAEL = edge2.NextInAEL;
      if (edge1.NextInAEL !== undefined) {
        edge1.NextInAEL.PrevInAEL = edge1;
      }
      edge1.PrevInAEL = edge2.PrevInAEL;
      if (edge1.PrevInAEL !== undefined) {
        edge1.PrevInAEL.NextInAEL = edge1;
      }
      edge2.NextInAEL = next;
      if (edge2.NextInAEL !== undefined) {
        edge2.NextInAEL.PrevInAEL = edge2;
      }
      edge2.PrevInAEL = prev;
      if (edge2.PrevInAEL !== undefined) {
        edge2.PrevInAEL.NextInAEL = edge2;
      }
    }

    if (edge1.PrevInAEL === undefined) {
      this.m_ActiveEdges = edge1;
    }
    else if (edge2.PrevInAEL === undefined) {
      this.m_ActiveEdges = edge2;
    }
  }

  protected DeleteFromAEL(e: TEdge): void {
    const AelPrev = e.PrevInAEL;
    const AelNext = e.NextInAEL;
    if (AelPrev === undefined && AelNext === undefined && e !== this.m_ActiveEdges) {
      return; //already deleted
    }
    if (AelPrev !== undefined) {
      AelPrev.NextInAEL = AelNext;
    }
    else {
      this.m_ActiveEdges = AelNext;
    }
    if (AelNext !== undefined) {
      AelNext.PrevInAEL = AelPrev;
    }
    e.NextInAEL = undefined;
    e.PrevInAEL = undefined;
  }
}


// clipper

// note that this method was changed so it should NOT modify pt, but rather return the new Z
export type ZFillCallbackImmutable = (bot1: IntPointXYZ, top1: IntPointXYZ, bot2: IntPointXYZ, top2: IntPointXYZ, pt: IntPointXYZ) => cInt;

export class Clipper extends ClipperBase {
  // TODO: better do this differently (enum?)
  //InitOptions that can be passed to the constructor ...
  public static readonly ioReverseSolution: int = 1;
  public static readonly ioStrictlySimple: int = 2;
  public static readonly ioPreserveCollinear: int = 4;

  private m_ClipType: ClipType = ClipType.ctIntersection;
  private m_Maxima?: Maxima;
  private m_SortedEdges?: TEdge;
  private m_IntersectList: IntersectNode[] = [];
  private m_IntersectNodeComparer: IntersectNodeComparer = MyIntersectNodeSort;
  private m_ExecuteLocked: boolean = false;
  private m_ClipFillType: PolyFillType = PolyFillType.pftEvenOdd;
  private m_SubjFillType: PolyFillType = PolyFillType.pftEvenOdd;
  private m_Joins: Join[] = [];
  private m_GhostJoins: Join[] = [];
  private m_UsingPolyTree: boolean = false;

  public ZFillFunctionImmutable?: ZFillCallbackImmutable; // only used when use_xyz is true

  public constructor(InitOptions: int = 0) {
    super();
    this.m_Scanbeam = undefined;
    this.m_Maxima = undefined;
    this.m_ActiveEdges = undefined;
    this.m_SortedEdges = undefined;
    //this.m_IntersectList = [];
    //this.m_IntersectNodeComparer = MyIntersectNodeSort;
    //this.m_ExecuteLocked = false;
    //this.m_UsingPolyTree = false;
    //this.m_PolyOuts = [];
    //this.m_Joins = [];
    //this.m_GhostJoins = [];
    // tslint:disable-next-line no-bitwise
    this.ReverseSolution = (Clipper.ioReverseSolution & InitOptions) !== 0;
    // tslint:disable-next-line no-bitwise
    this.StrictlySimple = (Clipper.ioStrictlySimple & InitOptions) !== 0;
    // tslint:disable-next-line no-bitwise
    this.PreserveCollinear = (Clipper.ioPreserveCollinear & InitOptions) !== 0;
    this.ZFillFunctionImmutable = undefined;
  }

  private InsertMaxima(X: long): void {
    //double-linked list: sorted ascending, ignoring dups.
    const newMax = new Maxima();
    newMax.X = X;
    if (this.m_Maxima === undefined) {
      this.m_Maxima = newMax;
      this.m_Maxima.Next = undefined;
      this.m_Maxima.Prev = undefined;
    }
    else if (X < this.m_Maxima.X) {
      newMax.Next = this.m_Maxima;
      newMax.Prev = undefined;
      this.m_Maxima = newMax;
    }
    else {
      let m = this.m_Maxima;
      while (m.Next !== undefined && X >= m.Next.X) {
        m = m.Next;
      }
      if (X === m.X) {
        return; //ie ignores duplicates (& CG to clean up newMax)
      }
      //insert newMax between m and m.Next ...
      newMax.Next = m.Next;
      newMax.Prev = m;
      if (m.Next !== undefined) {
        m.Next.Prev = newMax;
      }
      m.Next = newMax;
    }
  }

  public ReverseSolution: boolean = false;

  public StrictlySimple: boolean = false;

  public ExecutePaths(clipType: ClipType, solution: Paths, subjFillType: PolyFillType = PolyFillType.pftEvenOdd, clipFillType?: PolyFillType): boolean {
    if (!clipFillType) {
      clipFillType = subjFillType;
    }

    if (this.m_ExecuteLocked) {
      return false;
    }
    if (this.m_HasOpenPaths) {
      throw new ClipperError('Error: PolyTree struct is needed for open path clipping.');
    }

    this.m_ExecuteLocked = true;
    solution.length = 0;
    this.m_SubjFillType = subjFillType;
    this.m_ClipFillType = clipFillType;
    this.m_ClipType = clipType;
    this.m_UsingPolyTree = false;
    let succeeded = false;
    try {
      succeeded = this.ExecuteInternal();
      //build the return polygons ...
      if (succeeded) {
        this.BuildResult(solution);
      }
    }
    finally {
      this.DisposeAllPolyPts();
      this.m_ExecuteLocked = false;
    }
    return succeeded;
  }

  public ExecutePolyTree(clipType: ClipType, polytree: PolyTree, subjFillType: PolyFillType = PolyFillType.pftEvenOdd, clipFillType?: PolyFillType) {
    if (!clipFillType) {
      clipFillType = subjFillType;
    }

    if (this.m_ExecuteLocked) {
      return false;
    }
    this.m_ExecuteLocked = true;
    this.m_SubjFillType = subjFillType;
    this.m_ClipFillType = clipFillType;
    this.m_ClipType = clipType;
    this.m_UsingPolyTree = true;
    let succeeded = false;
    try {
      succeeded = this.ExecuteInternal();
      //build the return polygons ...
      if (succeeded) {
        this.BuildResult2(polytree);
      }
    }
    finally {
      this.DisposeAllPolyPts();
      this.m_ExecuteLocked = false;
    }
    return succeeded;
  }

  private static FixHoleLinkage(outRec: OutRec): void {
    //skip if an outermost polygon or
    //already already points to the correct FirstLeft ...
    if (outRec.FirstLeft === undefined ||
      outRec.IsHole !== outRec.FirstLeft.IsHole &&
      outRec.FirstLeft.Pts !== undefined) {
      return;
    }

    let orfl: OutRec | undefined = outRec.FirstLeft;
    while (orfl !== undefined && (orfl.IsHole === outRec.IsHole || orfl.Pts === undefined)) {
      orfl = orfl.FirstLeft;
    }
    outRec.FirstLeft = orfl;
  }

  private ExecuteInternal(): boolean {
    try {
      this.Reset();
      this.m_SortedEdges = undefined;
      this.m_Maxima = undefined;

      let botY: long = 0, topY: long = 0;
      const popResult1 = this.PopScanbeamNoOut();
      if (!popResult1.res) {
        return false;
      }
      this.InsertLocalMinimaIntoAEL(botY);

      const popScanbeamCheck = () => {
        const popResult2 = this.PopScanbeamNoOut();
        topY = popResult2.Y;
        return popResult2.res;
      };

      while (popScanbeamCheck() || this.LocalMinimaPending()) {
        this.ProcessHorizontals();
        this.m_GhostJoins.length = 0;
        if (!this.ProcessIntersections(topY)) {
          return false;
        }
        this.ProcessEdgesAtTopOfScanbeam(topY);
        botY = topY;
        this.InsertLocalMinimaIntoAEL(botY);
      }

      //fix orientations ...
      for (let ii = 0, max = this.m_PolyOuts.length; ii < max; ii++) {
        const outRec = this.m_PolyOuts[ii];
        if (outRec!.Pts === undefined || outRec!.IsOpen) {
          continue;
        }
        if ((outRec!.IsHole !== this.ReverseSolution) === (Clipper.AreaOutRec(outRec!) > 0)) {
          Clipper.ReversePolyPtLinks(outRec!.Pts);
        }
      }

      this.JoinCommonEdges();

      for (let ii = 0, max = this.m_PolyOuts.length; ii < max; ii++) {
        const outRec = this.m_PolyOuts[ii];
        if (outRec!.Pts === undefined) {
          //continue; // unneeded
        }
        else if (outRec!.IsOpen) {
          Clipper.FixupOutPolyline(outRec!);
        }
        else {
          this.FixupOutPolygon(outRec!);
        }
      }

      if (this.StrictlySimple) {
        this.DoSimplePolygons();
      }
      return true;
    }
    //catch { return false; }
    finally {
      this.m_Joins.length = 0;
      this.m_GhostJoins.length = 0;
    }
  }

  private DisposeAllPolyPts(): void {
    for (let i: int = 0; i < this.m_PolyOuts.length; ++i) {
      this.DisposeOutRec(i);
    }
    this.m_PolyOuts.length = 0;
  }

  private AddJoin(Op1: OutPt, Op2: OutPt, OffPt: IntPoint): void {
    const j = new Join();
    j.OutPt1 = Op1;
    j.OutPt2 = Op2;
    j.OffPt = cloneIntPoint(OffPt);
    this.m_Joins.push(j);
  }

  private AddGhostJoin(Op: OutPt, OffPt: IntPoint): void {
    const j = new Join();
    j.OutPt1 = Op;
    j.OffPt = cloneIntPoint(OffPt);
    this.m_GhostJoins.push(j);
  }

  private SetZImmutable(pt: IntPointXYZ, e1: TEdge, e2: TEdge): IntPoint {
    // this function was modified so rather than mutate the point it returns a new one

    if (pt.Z !== 0 || this.ZFillFunctionImmutable === undefined) return pt;

    let z = 0;
    if (intPointEquals(pt, e1.Bot)) {
      z = (e1.Bot as IntPointXYZ).Z;
    }
    else if (intPointEquals(pt, e1.Top)) {
      z = (e1.Top as IntPointXYZ).Z;
    }
    else if (intPointEquals(pt, e2.Bot)) {
      z = (e2.Bot as IntPointXYZ).Z;
    }
    else if (intPointEquals(pt, e2.Top)) {
      z = (e2.Top as IntPointXYZ).Z;
    }
    else {
      z = this.ZFillFunctionImmutable((e1.Bot as IntPointXYZ), (e1.Top as IntPointXYZ), (e2.Bot as IntPointXYZ), (e2.Top as IntPointXYZ), pt);
    }

    return newIntPointXYZ(pt.X, pt.Y, z);
  }

  private InsertLocalMinimaIntoAEL(botY: long): void {
    let lm: LocalMinima | undefined;

    const popLocalMinimaCheck = () => {
      const popResult2 = this.PopLocalMinimaNoOut(botY);
      lm = popResult2.current;
      return popResult2.res;
    };

    while (popLocalMinimaCheck()) {
      const lb = lm!.LeftBound;
      const rb = lm!.RightBound;

      let Op1: OutPt | undefined;
      if (lb === undefined) {
        this.InsertEdgeIntoAEL(rb!, undefined);
        this.SetWindingCount(rb!);
        if (this.IsContributing(rb!)) {
          Op1 = this.AddOutPt(rb!, rb!.Bot);
        }
      }
      else if (rb === undefined) {
        this.InsertEdgeIntoAEL(lb, undefined);
        this.SetWindingCount(lb);
        if (this.IsContributing(lb)) {
          Op1 = this.AddOutPt(lb, lb.Bot);
        }
        this.InsertScanbeam(lb.Top.Y);
      }
      else {
        this.InsertEdgeIntoAEL(lb, undefined);
        this.InsertEdgeIntoAEL(rb, lb);
        this.SetWindingCount(lb);
        rb.WindCnt = lb.WindCnt;
        rb.WindCnt2 = lb.WindCnt2;
        if (this.IsContributing(lb)) {
          Op1 = this.AddLocalMinPoly(lb, rb, lb.Bot);
        }
        this.InsertScanbeam(lb.Top.Y);
      }

      if (rb !== undefined) {
        if (Clipper.IsHorizontal(rb)) {
          if (rb.NextInLML !== undefined) {
            this.InsertScanbeam(rb.NextInLML.Top.Y);
          }
          this.AddEdgeToSEL(rb);
        }
        else {
          this.InsertScanbeam(rb.Top.Y);
        }
      }

      if (lb === undefined || rb === undefined) {
        continue;
      }

      //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
      if (Op1 !== undefined && ClipperBase.IsHorizontal(rb) && this.m_GhostJoins.length > 0 && rb.WindDelta !== 0) {
        for (let i: int = 0; i < this.m_GhostJoins.length; i++) {
          //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
          //the 'ghost' join to a real join ready for later ...
          const j = this.m_GhostJoins[i];
          if (Clipper.HorzSegmentsOverlap(j.OutPt1.Pt.X, j.OffPt.X, rb.Bot.X, rb.Top.X)) {
            this.AddJoin(j.OutPt1, Op1, j.OffPt);
          }
        }
      }

      if (lb.OutIdx >= 0 && lb.PrevInAEL !== undefined &&
        lb.PrevInAEL.Curr.X === lb.Bot.X &&
        lb.PrevInAEL.OutIdx >= 0 &&
        Clipper.IntPoint4SlopesEqual(lb.PrevInAEL.Curr, lb.PrevInAEL.Top, lb.Curr, lb.Top, this.m_UseFullRange) &&
        lb.WindDelta !== 0 && lb.PrevInAEL.WindDelta !== 0) {
        const Op2 = this.AddOutPt(lb.PrevInAEL, lb.Bot);
        this.AddJoin(Op1!, Op2, lb.Top);
      }

      if (lb.NextInAEL !== rb) {
        if (rb.OutIdx >= 0 && rb.PrevInAEL!.OutIdx >= 0 &&
          ClipperBase.IntPoint4SlopesEqual(rb.PrevInAEL!.Curr, rb.PrevInAEL!.Top, rb.Curr, rb.Top, this.m_UseFullRange) &&
          rb.WindDelta !== 0 && rb.PrevInAEL!.WindDelta !== 0) {
          const Op2 = this.AddOutPt(rb.PrevInAEL!, rb.Bot);
          this.AddJoin(Op1!, Op2, rb.Top);
        }

        let e = lb.NextInAEL;
        if (e !== undefined) {
          while (e !== rb) {
            //nb: For calculating winding counts etc, IntersectEdges() assumes
            //that param1 will be to the right of param2 ABOVE the intersection ...
            lb.Curr = this.IntersectEdgesImmutable(rb, e!, lb.Curr); //order important here
            e = e!.NextInAEL;
          }
        }
      }
    }
  }

  private InsertEdgeIntoAEL(edge: TEdge, startEdge: TEdge | undefined): void {
    if (this.m_ActiveEdges === undefined) {
      edge.PrevInAEL = undefined;
      edge.NextInAEL = undefined;
      this.m_ActiveEdges = edge;
    }
    else if (startEdge === undefined && Clipper.E2InsertsBeforeE1(this.m_ActiveEdges, edge)) {
      edge.PrevInAEL = undefined;
      edge.NextInAEL = this.m_ActiveEdges;
      this.m_ActiveEdges.PrevInAEL = edge;
      this.m_ActiveEdges = edge;
    }
    else {
      if (startEdge === undefined) {
        startEdge = this.m_ActiveEdges;
      }
      while (startEdge.NextInAEL !== undefined &&
      !Clipper.E2InsertsBeforeE1(startEdge.NextInAEL, edge)) {
        startEdge = startEdge.NextInAEL;
      }
      edge.NextInAEL = startEdge.NextInAEL;
      if (startEdge.NextInAEL !== undefined) {
        startEdge.NextInAEL.PrevInAEL = edge;
      }
      edge.PrevInAEL = startEdge;
      startEdge.NextInAEL = edge;
    }
  }

  private static E2InsertsBeforeE1(e1: TEdge, e2: TEdge): boolean {
    if (e2.Curr.X === e1.Curr.X) {
      if (e2.Top.Y > e1.Top.Y) {
        return e2.Top.X < TopX(e1, e2.Top.Y);
      }
      else {
        return e1.Top.X > TopX(e2, e1.Top.Y);
      }
    }
    else {
      return e2.Curr.X < e1.Curr.X;
    }
  }

  private IsEvenOddFillType(edge: TEdge): boolean {
    if (edge.PolyTyp === PolyType.ptSubject) {
      return this.m_SubjFillType === PolyFillType.pftEvenOdd;
    }
    else {
      return this.m_ClipFillType === PolyFillType.pftEvenOdd;
    }
  }

  private IsEvenOddAltFillType(edge: TEdge): boolean {
    if (edge.PolyTyp === PolyType.ptSubject) {
      return this.m_ClipFillType === PolyFillType.pftEvenOdd;
    }
    else {
      return this.m_SubjFillType === PolyFillType.pftEvenOdd;
    }
  }

  private IsContributing(edge: TEdge): boolean {
    let pft: PolyFillType, pft2: PolyFillType;
    if (edge.PolyTyp === PolyType.ptSubject) {
      pft = this.m_SubjFillType;
      pft2 = this.m_ClipFillType;
    }
    else {
      pft = this.m_ClipFillType;
      pft2 = this.m_SubjFillType;
    }

    switch (pft) {
      case PolyFillType.pftEvenOdd:
        //return false if a subj line has been flagged as inside a subj polygon
        if (edge.WindDelta === 0 && edge.WindCnt !== 1) {
          return false;
        }
        break;
      case PolyFillType.pftNonZero:
        if (Math.abs(edge.WindCnt) !== 1) {
          return false;
        }
        break;
      case PolyFillType.pftPositive:
        if (edge.WindCnt !== 1) {
          return false;
        }
        break;
      default: //PolyFillType.pftNegative
        if (edge.WindCnt !== -1) {
          return false;
        }
        break;
    }

    switch (this.m_ClipType) {
      case ClipType.ctIntersection:
        //noinspection NestedSwitchStatementJS
        switch (pft2) {
          case PolyFillType.pftEvenOdd:
          case PolyFillType.pftNonZero:
            return edge.WindCnt2 !== 0;
          case PolyFillType.pftPositive:
            return edge.WindCnt2 > 0;
          default:
            return edge.WindCnt2 < 0;
        }
      case ClipType.ctUnion:
        //noinspection NestedSwitchStatementJS
        switch (pft2) {
          case PolyFillType.pftEvenOdd:
          case PolyFillType.pftNonZero:
            return edge.WindCnt2 === 0;
          case PolyFillType.pftPositive:
            return edge.WindCnt2 <= 0;
          default:
            return edge.WindCnt2 >= 0;
        }
      case ClipType.ctDifference:
        if (edge.PolyTyp === PolyType.ptSubject) {
          //noinspection NestedSwitchStatementJS
          switch (pft2) {
            case PolyFillType.pftEvenOdd:
            case PolyFillType.pftNonZero:
              return edge.WindCnt2 === 0;
            case PolyFillType.pftPositive:
              return edge.WindCnt2 <= 0;
            default:
              return edge.WindCnt2 >= 0;
          }
        }
        else {
          //noinspection NestedSwitchStatementJS
          switch (pft2) {
            case PolyFillType.pftEvenOdd:
            case PolyFillType.pftNonZero:
              return edge.WindCnt2 !== 0;
            case PolyFillType.pftPositive:
              return edge.WindCnt2 > 0;
            default:
              return edge.WindCnt2 < 0;
          }
        }
      case ClipType.ctXor:
        if (edge.WindDelta === 0) { //XOr always contributing unless open
          //noinspection NestedSwitchStatementJS
          switch (pft2) {
            case PolyFillType.pftEvenOdd:
            case PolyFillType.pftNonZero:
              return edge.WindCnt2 === 0;
            case PolyFillType.pftPositive:
              return edge.WindCnt2 <= 0;
            default:
              return edge.WindCnt2 >= 0;
          }
        }
        else {
          return true;
        }
      default:
        break;
    }
    return true;
  }

  private SetWindingCount(edge: TEdge): void {
    let e = edge.PrevInAEL;
    //find the edge of the same polytype that immediately preceeds 'edge' in AEL
    while (e !== undefined && (e.PolyTyp !== edge.PolyTyp || e.WindDelta === 0)) {
      e = e.PrevInAEL;
    }
    if (e === undefined) {
      const pft = edge.PolyTyp === PolyType.ptSubject ? this.m_SubjFillType : this.m_ClipFillType;
      if (edge.WindDelta === 0) {
        edge.WindCnt = pft === PolyFillType.pftNegative ? -1 : 1;
      }
      else {
        edge.WindCnt = edge.WindDelta;
      }
      edge.WindCnt2 = 0;
      e = this.m_ActiveEdges; //ie get ready to calc WindCnt2
    }
    else if (edge.WindDelta === 0 && this.m_ClipType !== ClipType.ctUnion) {
      edge.WindCnt = 1;
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL; //ie get ready to calc WindCnt2
    }
    else if (this.IsEvenOddFillType(edge)) {
      //EvenOdd filling ...
      if (edge.WindDelta === 0) {
        //are we inside a subj polygon ...
        let Inside = true;
        let e2 = e.PrevInAEL;
        while (e2 !== undefined) {
          if (e2.PolyTyp === e.PolyTyp && e2.WindDelta !== 0) {
            Inside = !Inside;
          }
          e2 = e2.PrevInAEL;
        }
        edge.WindCnt = Inside ? 0 : 1;
      }
      else {
        edge.WindCnt = edge.WindDelta;
      }
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL; //ie get ready to calc WindCnt2
    }
    else {
      //nonZero, Positive or Negative filling ...
      if (e.WindCnt * e.WindDelta < 0) {
        //prev edge is 'decreasing' WindCount (WC) toward zero
        //so we're outside the previous polygon ...
        if (Math.abs(e.WindCnt) > 1) {
          //outside prev poly but still inside another.
          //when reversing direction of prev poly use the same WC
          if (e.WindDelta * edge.WindDelta < 0) {
            edge.WindCnt = e.WindCnt;
          }
          //otherwise continue to 'decrease' WC ...
          else {
            edge.WindCnt = e.WindCnt + edge.WindDelta;
          }
        }
        else {
          //now outside all polys of same polytype so set own WC ...
          edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
        }
      }
      else {
        //prev edge is 'increasing' WindCount (WC) away from zero
        //so we're inside the previous polygon ...
        if (edge.WindDelta === 0) {
          edge.WindCnt = e.WindCnt < 0 ? e.WindCnt - 1 : e.WindCnt + 1;
        }
        //if wind direction is reversing prev then use same WC
        else if (e.WindDelta * edge.WindDelta < 0) {
          edge.WindCnt = e.WindCnt;
        }
        //otherwise add to WC ...
        else {
          edge.WindCnt = e.WindCnt + edge.WindDelta;
        }
      }
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL; //ie get ready to calc WindCnt2
    }

    //update WindCnt2 ...
    if (this.IsEvenOddAltFillType(edge)) {
      //EvenOdd filling ...
      while (e !== edge) {
        if (e!.WindDelta !== 0) {
          edge.WindCnt2 = edge.WindCnt2 === 0 ? 1 : 0;
        }
        e = e!.NextInAEL;
      }
    }
    else {
      //nonZero, Positive or Negative filling ...
      while (e !== edge) {
        edge.WindCnt2 += e!.WindDelta;
        e = e!.NextInAEL;
      }
    }
  }

  private AddEdgeToSEL(edge: TEdge): void {
    //SEL pointers in PEdge are use to build transient lists of horizontal edges.
    //However, since we don't need to worry about processing order, all additions
    //are made to the front of the list ...
    if (this.m_SortedEdges === undefined) {
      this.m_SortedEdges = edge;
      edge.PrevInSEL = undefined;
      edge.NextInSEL = undefined;
    }
    else {
      edge.NextInSEL = this.m_SortedEdges;
      edge.PrevInSEL = undefined;
      this.m_SortedEdges.PrevInSEL = edge;
      this.m_SortedEdges = edge;
    }
  }

  private PopEdgeFromSelNoOut(): { e: TEdge | undefined, res: boolean } { // out e -> return { res, e }
    //Pop edge from front of SEL (ie SEL is a FILO list)
    const e = this.m_SortedEdges;
    if (e === undefined) {
      return { res: false, e: e };
    }
    const oldE = e;
    this.m_SortedEdges = e.NextInSEL;
    if (this.m_SortedEdges !== undefined) {
      this.m_SortedEdges.PrevInSEL = undefined;
    }
    oldE.NextInSEL = undefined;
    oldE.PrevInSEL = undefined;
    return { res: true, e: e };
  }

  protected CopyAELToSEL(): void {
    let e = this.m_ActiveEdges;
    this.m_SortedEdges = e;
    while (e !== undefined) {
      e.PrevInSEL = e.PrevInAEL;
      e.NextInSEL = e.NextInAEL;
      e = e.NextInAEL;
    }
  }

  private SwapPositionsInSEL(edge1: TEdge, edge2: TEdge): void {
    if (edge1.NextInSEL === undefined && edge1.PrevInSEL === undefined) {
      return;
    }
    if (edge2.NextInSEL === undefined && edge2.PrevInSEL === undefined) {
      return;
    }

    if (edge1.NextInSEL === edge2) {
      const next = edge2.NextInSEL;
      if (next !== undefined) {
        next.PrevInSEL = edge1;
      }
      const prev = edge1.PrevInSEL;
      if (prev !== undefined) {
        prev.NextInSEL = edge2;
      }
      edge2.PrevInSEL = prev;
      edge2.NextInSEL = edge1;
      edge1.PrevInSEL = edge2;
      edge1.NextInSEL = next;
    }
    else if (edge2.NextInSEL === edge1) {
      const next = edge1.NextInSEL;
      if (next !== undefined) {
        next.PrevInSEL = edge2;
      }
      const prev = edge2.PrevInSEL;
      if (prev !== undefined) {
        prev.NextInSEL = edge1;
      }
      edge1.PrevInSEL = prev;
      edge1.NextInSEL = edge2;
      edge2.PrevInSEL = edge1;
      edge2.NextInSEL = next;
    }
    else {
      const next = edge1.NextInSEL;
      const prev = edge1.PrevInSEL;
      edge1.NextInSEL = edge2.NextInSEL;
      if (edge1.NextInSEL !== undefined) {
        edge1.NextInSEL.PrevInSEL = edge1;
      }
      edge1.PrevInSEL = edge2.PrevInSEL;
      if (edge1.PrevInSEL !== undefined) {
        edge1.PrevInSEL.NextInSEL = edge1;
      }
      edge2.NextInSEL = next;
      if (edge2.NextInSEL !== undefined) {
        edge2.NextInSEL.PrevInSEL = edge2;
      }
      edge2.PrevInSEL = prev;
      if (edge2.PrevInSEL !== undefined) {
        edge2.PrevInSEL.NextInSEL = edge2;
      }
    }

    if (edge1.PrevInSEL === undefined) {
      this.m_SortedEdges = edge1;
    }
    else if (edge2.PrevInSEL === undefined) {
      this.m_SortedEdges = edge2;
    }
  }

  private AddLocalMaxPoly(e1: TEdge, e2: TEdge, pt: IntPoint) {
    this.AddOutPt(e1, pt);
    if (e2.WindDelta === 0) {
      this.AddOutPt(e2, pt);
    }
    if (e1.OutIdx === e2.OutIdx) {
      e1.OutIdx = Unassigned;
      e2.OutIdx = Unassigned;
    }
    else if (e1.OutIdx < e2.OutIdx) {
      this.AppendPolygon(e1, e2);
    }
    else {
      this.AppendPolygon(e2, e1);
    }
  }

  private AddLocalMinPoly(e1: TEdge, e2: TEdge, pt: IntPoint): OutPt | undefined {
    let result: OutPt | undefined;
    let e: TEdge | undefined, prevE: TEdge | undefined;
    if (ClipperBase.IsHorizontal(e2) || e1.Dx > e2.Dx) {
      result = this.AddOutPt(e1, pt);
      e2.OutIdx = e1.OutIdx;
      e1.Side = EdgeSide.esLeft;
      e2.Side = EdgeSide.esRight;
      e = e1;
      if (e.PrevInAEL === e2) {
        prevE = e2.PrevInAEL;
      }
      else {
        prevE = e.PrevInAEL;
      }
    }
    else {
      result = this.AddOutPt(e2, pt);
      e1.OutIdx = e2.OutIdx;
      e1.Side = EdgeSide.esRight;
      e2.Side = EdgeSide.esLeft;
      e = e2;
      if (e.PrevInAEL === e1) {
        prevE = e1.PrevInAEL;
      }
      else {
        prevE = e.PrevInAEL;
      }
    }

    if (prevE !== undefined && prevE.OutIdx >= 0 && prevE.Top.Y < pt.Y && e.Top.Y < pt.Y) {
      const xPrev = TopX(prevE, pt.Y);
      const xE = TopX(e, pt.Y);
      if (xPrev === xE && e.WindDelta !== 0 && prevE.WindDelta !== 0 &&
        ClipperBase.IntPoint4SlopesEqual(newIntPoint(xPrev, pt.Y), prevE.Top, newIntPoint(xE, pt.Y), e.Top, this.m_UseFullRange)) {
        const outPt = this.AddOutPt(prevE, pt);
        this.AddJoin(result!, outPt, e.Top);
      }
    }
    return result;
  }

  private AddOutPt(e: TEdge, pt: IntPoint): OutPt {
    if (e.OutIdx < 0) {
      const outRec = this.CreateOutRec();
      outRec.IsOpen = e.WindDelta === 0;
      const newOp = new OutPt();
      outRec.Pts = newOp;
      newOp.Idx = outRec.Idx;
      newOp.Pt = cloneIntPoint(pt);
      newOp.Next = newOp;
      newOp.Prev = newOp;
      if (!outRec.IsOpen) {
        this.SetHoleState(e, outRec);
      }
      e.OutIdx = outRec.Idx; //nb: do this after SetZ !
      return newOp;
    }
    else {
      const outRec = this.m_PolyOuts[e.OutIdx];
      //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
      const op = outRec!.Pts;
      const ToFront = e.Side === EdgeSide.esLeft;
      if (ToFront && intPointEquals(pt, op!.Pt)) {
        return op!;
      }
      else if (!ToFront && intPointEquals(pt, op!.Prev.Pt)) {
        return op!.Prev;
      }

      const newOp = new OutPt();
      newOp.Idx = outRec!.Idx;
      newOp.Pt = cloneIntPoint(pt);
      newOp.Next = op!;
      newOp.Prev = op!.Prev;
      newOp.Prev.Next = newOp;
      op!.Prev = newOp;
      if (ToFront) {
        outRec!.Pts = newOp;
      }
      return newOp;
    }
  }

  private GetLastOutPt(e: TEdge): OutPt | undefined {
    const outRec = this.m_PolyOuts[e.OutIdx];
    if (e.Side === EdgeSide.esLeft) {
      return outRec!.Pts;
    }
    else {
      return outRec!.Pts!.Prev;
    }
  }

  private static HorzSegmentsOverlap(seg1a: long, seg1b: long, seg2a: long, seg2b: long): boolean {
    if (seg1a > seg1b) {
      const tmp = seg1a;
      seg1a = seg1b;
      seg1b = tmp;
    }
    if (seg2a > seg2b) {
      const tmp = seg2a;
      seg2a = seg2b;
      seg2b = tmp;
    }
    return seg1a < seg2b && seg2a < seg1b;
  }

  private SetHoleState(e: TEdge, outRec: OutRec): void {
    let e2 = e.PrevInAEL;
    let eTmp: TEdge | undefined;
    while (e2 !== undefined) {
      if (e2.OutIdx >= 0 && e2.WindDelta !== 0) {
        if (eTmp === undefined) {
          eTmp = e2;
        }
        else if (eTmp.OutIdx === e2.OutIdx) {
          eTmp = undefined; //paired
        }
      }
      e2 = e2.PrevInAEL;
    }

    if (eTmp === undefined) {
      outRec.FirstLeft = undefined;
      outRec.IsHole = false;
    }
    else {
      outRec.FirstLeft = this.m_PolyOuts[eTmp.OutIdx];
      outRec.IsHole = !outRec!.FirstLeft!.IsHole;
    }
  }

  private static GetDx(pt1: IntPoint, pt2: IntPoint): double {
    if (pt1.Y === pt2.Y) {
      return horizontal;
    }
    else {
      return (pt2.X - pt1.X) / (pt2.Y - pt1.Y);
    }
  }

  private static FirstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
    let p = btmPt1.Prev;
    while (intPointEquals(p!.Pt, btmPt1.Pt) && p !== btmPt1) {
      p = p!.Prev;
    }
    const dx1p = Math.abs(Clipper.GetDx(btmPt1.Pt, p!.Pt));
    p = btmPt1.Next;
    while (intPointEquals(p!.Pt, btmPt1.Pt) && p !== btmPt1) {
      p = p!.Next;
    }
    const dx1n = Math.abs(Clipper.GetDx(btmPt1.Pt, p!.Pt));

    p = btmPt2.Prev;
    while (intPointEquals(p!.Pt, btmPt2.Pt) && p !== btmPt2) {
      p = p!.Prev;
    }
    const dx2p = Math.abs(Clipper.GetDx(btmPt2.Pt, p!.Pt));
    p = btmPt2.Next;
    while (intPointEquals(p!.Pt, btmPt2.Pt) && p !== btmPt2) {
      p = p!.Next;
    }
    const dx2n = Math.abs(Clipper.GetDx(btmPt2.Pt, p!.Pt));

    if (Math.max(dx1p, dx1n) === Math.max(dx2p, dx2n) &&
      Math.min(dx1p, dx1n) === Math.min(dx2p, dx2n)) {
      return Clipper.AreaOutPt(btmPt1) > 0; //if otherwise identical use orientation
    }
    else {
      return dx1p >= dx2p && dx1p >= dx2n || dx1n >= dx2p && dx1n >= dx2n;
    }
  }

  private static GetBottomPt(pp: OutPt): OutPt {
    let dups: OutPt | undefined;
    let p = pp.Next;
    while (p !== pp) {
      if (p!.Pt.Y > pp.Pt.Y) {
        pp = p!;
        dups = undefined;
      }
      else if (p!.Pt.Y === pp.Pt.Y && p!.Pt.X <= pp.Pt.X) {
        if (p.Pt.X < pp.Pt.X) {
          dups = undefined;
          pp = p!;
        }
        else {
          if (p!.Next !== pp && p!.Prev !== pp) {
            dups = p;
          }
        }
      }
      p = p!.Next;
    }
    if (dups !== undefined) {
      //there appears to be at least 2 vertices at bottomPt so ...
      while (dups !== p) {
        if (!Clipper.FirstIsBottomPt(p, dups!)) {
          pp = dups!;
        }
        dups = dups!.Next;
        while (!intPointEquals(dups!.Pt, pp.Pt)) {
          dups = dups!.Next;
        }
      }
    }
    return pp;
  }

  private static GetLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
    //work out which polygon fragment has the correct hole state ...
    if (outRec1.BottomPt === undefined) {
      outRec1.BottomPt = Clipper.GetBottomPt(outRec1.Pts!);
    }
    if (outRec2.BottomPt === undefined) {
      outRec2.BottomPt = Clipper.GetBottomPt(outRec2.Pts!);
    }
    const bPt1 = outRec1.BottomPt;
    const bPt2 = outRec2.BottomPt;
    if (bPt1.Pt.Y > bPt2.Pt.Y) {
      return outRec1;
    }
    else if (bPt1.Pt.Y < bPt2.Pt.Y) {
      return outRec2;
    }
    else if (bPt1.Pt.X < bPt2.Pt.X) {
      return outRec1;
    }
    else if (bPt1.Pt.X > bPt2.Pt.X) {
      return outRec2;
    }
    else if (bPt1.Next === bPt1) {
      return outRec2;
    }
    else if (bPt2.Next === bPt2) {
      return outRec1;
    }
    else if (Clipper.FirstIsBottomPt(bPt1, bPt2)) {
      return outRec1;
    }
    else {
      return outRec2;
    }
  }

  private static OutRec1RightOfOutRec2(outRec1: OutRec, outRec2: OutRec): boolean {
    do {
      outRec1 = outRec1.FirstLeft!;
      if (outRec1 === outRec2) {
        return true;
      }
    } while (outRec1 !== undefined);
    return false;
  }

  private GetOutRec(idx: int) {
    let outrec = this.m_PolyOuts[idx]!;
    while (outrec !== this.m_PolyOuts[outrec.Idx]) {
      outrec = this.m_PolyOuts[outrec.Idx]!;
    }
    return outrec;
  }

  private AppendPolygon(e1: TEdge, e2: TEdge): void {
    const outRec1 = this.m_PolyOuts[e1.OutIdx]!;
    const outRec2 = this.m_PolyOuts[e2.OutIdx]!;

    let holeStateRec: OutRec | undefined;
    if (Clipper.OutRec1RightOfOutRec2(outRec1, outRec2)) {
      holeStateRec = outRec2;
    }
    else if (Clipper.OutRec1RightOfOutRec2(outRec2, outRec1)) {
      holeStateRec = outRec1;
    }
    else {
      holeStateRec = Clipper.GetLowermostRec(outRec1, outRec2);
    }

    //get the start and ends of both output polygons and
    //join E2 poly onto E1 poly and delete pointers to E2 ...
    const p1_lft = outRec1!.Pts!;
    const p1_rt = p1_lft!.Prev;
    const p2_lft = outRec2!.Pts!;
    const p2_rt = p2_lft!.Prev;

    //join e2 poly onto e1 poly and delete pointers to e2 ...
    if (e1.Side === EdgeSide.esLeft) {
      if (e2.Side === EdgeSide.esLeft) {
        //z y x a b c
        Clipper.ReversePolyPtLinks(p2_lft);
        p2_lft.Next = p1_lft;
        p1_lft.Prev = p2_lft;
        p1_rt.Next = p2_rt;
        p2_rt.Prev = p1_rt;
        outRec1.Pts = p2_rt;
      }
      else {
        //x y z a b c
        p2_rt.Next = p1_lft;
        p1_lft.Prev = p2_rt;
        p2_lft.Prev = p1_rt;
        p1_rt.Next = p2_lft;
        outRec1.Pts = p2_lft;
      }
    }
    else {
      if (e2.Side === EdgeSide.esRight) {
        //a b c z y x
        Clipper.ReversePolyPtLinks(p2_lft);
        p1_rt.Next = p2_rt;
        p2_rt.Prev = p1_rt;
        p2_lft.Next = p1_lft;
        p1_lft.Prev = p2_lft;
      }
      else {
        //a b c x y z
        p1_rt.Next = p2_lft;
        p2_lft.Prev = p1_rt;
        p1_lft.Prev = p2_rt;
        p2_rt.Next = p1_lft;
      }
    }

    outRec1.BottomPt = undefined;
    if (holeStateRec === outRec2) {
      if (outRec2.FirstLeft !== outRec1) {
        outRec1.FirstLeft = outRec2.FirstLeft;
      }
      outRec1.IsHole = outRec2.IsHole;
    }
    outRec2.Pts = undefined;
    outRec2.BottomPt = undefined;

    outRec2.FirstLeft = outRec1;

    const OKIdx = e1.OutIdx;
    const ObsoleteIdx = e2.OutIdx;

    e1.OutIdx = Unassigned; //nb: safe because we only get here via AddLocalMaxPoly
    e2.OutIdx = Unassigned;

    let e = this.m_ActiveEdges;
    while (e !== undefined) {
      if (e.OutIdx === ObsoleteIdx) {
        e.OutIdx = OKIdx;
        e.Side = e1.Side;
        break;
      }
      e = e.NextInAEL;
    }
    outRec2.Idx = outRec1.Idx;
  }

  private static ReversePolyPtLinks(pp: OutPt | undefined): void {
    if (pp === undefined) {
      return;
    }
    let pp1: OutPt | undefined;
    let pp2: OutPt | undefined;
    pp1 = pp;
    do {
      pp2 = pp1!.Next;
      pp1!.Next = pp1!.Prev;
      pp1!.Prev = pp2;
      pp1 = pp2;
    } while (pp1 !== pp);
  }

  private static SwapSides(edge1: TEdge, edge2: TEdge ): void {
    const side = edge1.Side;
    edge1.Side = edge2.Side;
    edge2.Side = side;
  }

  private static SwapPolyIndexes(edge1: TEdge, edge2: TEdge): void {
    const outIdx = edge1.OutIdx;
    edge1.OutIdx = edge2.OutIdx;
    edge2.OutIdx = outIdx;
  }

  private IntersectEdgesImmutable(e1: TEdge, e2: TEdge, pt: IntPoint): IntPoint {
    // this function was changed so pt was not mutated but rather returned a new copy

    //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
    //e2 in AEL except when e1 is being inserted at the intersection point ...

    const e1Contributing = e1.OutIdx >= 0;
    const e2Contributing = e2.OutIdx >= 0;

    if (use_xyz) {
      pt = this.SetZImmutable((pt as IntPointXYZ), e1, e2);
    }

    if (use_lines) {
      //if either edge is on an OPEN path ...
      if (e1.WindDelta === 0 || e2.WindDelta === 0) {
        //ignore subject-subject open path intersections UNLESS they
        //are both open paths, AND they are both 'contributing maximas' ...
        if (e1.WindDelta === 0 && e2.WindDelta === 0) {
          return pt;
        }
        //if intersecting a subj line with a subj poly ...
        else if (e1.PolyTyp === e2.PolyTyp &&
          e1.WindDelta !== e2.WindDelta && this.m_ClipType === ClipType.ctUnion) {
          if (e1.WindDelta === 0) {
            if (e2Contributing) {
              this.AddOutPt(e1, pt);
              if (e1Contributing) {
                e1.OutIdx = Unassigned;
              }
            }
          }
          else {
            if (e1Contributing) {
              this.AddOutPt(e2, pt);
              if (e2Contributing) {
                e2.OutIdx = Unassigned;
              }
            }
          }
        }
        else if (e1.PolyTyp !== e2.PolyTyp) {
          if (e1.WindDelta === 0 && Math.abs(e2.WindCnt) === 1 &&
            (this.m_ClipType !== ClipType.ctUnion || e2.WindCnt2 === 0)) {
            this.AddOutPt(e1, pt);
            if (e1Contributing) {
              e1.OutIdx = Unassigned;
            }
          }
          else if (e2.WindDelta === 0 && Math.abs(e1.WindCnt) === 1 &&
            (this.m_ClipType !== ClipType.ctUnion || e1.WindCnt2 === 0)) {
            this.AddOutPt(e2, pt);
            if (e2Contributing) {
              e2.OutIdx = Unassigned;
            }
          }
        }
        return pt;
      }
    }

    //update winding counts...
    //assumes that e1 will be to the Right of e2 ABOVE the intersection
    if (e1.PolyTyp === e2.PolyTyp) {
      if (this.IsEvenOddFillType(e1)) {
        const oldE1WindCnt = e1.WindCnt;
        e1.WindCnt = e2.WindCnt;
        e2.WindCnt = oldE1WindCnt;
      }
      else {
        if (e1.WindCnt + e2.WindDelta === 0) {
          e1.WindCnt = -e1.WindCnt;
        }
        else {
          e1.WindCnt += e2.WindDelta;
        }
        if (e2.WindCnt - e1.WindDelta === 0) {
          e2.WindCnt = -e2.WindCnt;
        }
        else {
          e2.WindCnt -= e1.WindDelta;
        }
      }
    }
    else {
      if (!this.IsEvenOddFillType(e2)) {
        e1.WindCnt2 += e2.WindDelta;
      }
      else {
        e1.WindCnt2 = e1.WindCnt2 === 0 ? 1 : 0;
      }
      if (!this.IsEvenOddFillType(e1)) {
        e2.WindCnt2 -= e1.WindDelta;
      }
      else {
        e2.WindCnt2 = e2.WindCnt2 === 0 ? 1 : 0;
      }
    }

    let e1FillType = PolyFillType.pftEvenOdd, e2FillType = PolyFillType.pftEvenOdd, e1FillType2 = PolyFillType.pftEvenOdd, e2FillType2 = PolyFillType.pftEvenOdd;
    if (e1.PolyTyp === PolyType.ptSubject) {
      e1FillType = this.m_SubjFillType;
      e1FillType2 = this.m_ClipFillType;
    }
    else {
      e1FillType = this.m_ClipFillType;
      e1FillType2 = this.m_SubjFillType;
    }
    if (e2.PolyTyp === PolyType.ptSubject) {
      e2FillType = this.m_SubjFillType;
      e2FillType2 = this.m_ClipFillType;
    }
    else {
      e2FillType = this.m_ClipFillType;
      e2FillType2 = this.m_SubjFillType;
    }

    let e1Wc: int = 0, e2Wc: int = 0;
    switch (e1FillType) {
      case PolyFillType.pftPositive:
        e1Wc = e1.WindCnt;
        break;
      case PolyFillType.pftNegative:
        e1Wc = -e1.WindCnt;
        break;
      default:
        e1Wc = Math.abs(e1.WindCnt);
        break;
    }
    switch (e2FillType) {
      case PolyFillType.pftPositive:
        e2Wc = e2.WindCnt;
        break;
      case PolyFillType.pftNegative:
        e2Wc = -e2.WindCnt;
        break;
      default:
        e2Wc = Math.abs(e2.WindCnt);
        break;
    }

    if (e1Contributing && e2Contributing) {
      if (e1Wc !== 0 && e1Wc !== 1 || e2Wc !== 0 && e2Wc !== 1 ||
        e1.PolyTyp !== e2.PolyTyp && this.m_ClipType !== ClipType.ctXor) {
        this.AddLocalMaxPoly(e1, e2, pt);
      }
      else {
        this.AddOutPt(e1, pt);
        this.AddOutPt(e2, pt);
        Clipper.SwapSides(e1, e2);
        Clipper.SwapPolyIndexes(e1, e2);
      }
    }
    else if (e1Contributing) {
      if (e2Wc === 0 || e2Wc === 1) {
        this.AddOutPt(e1, pt);
        Clipper.SwapSides(e1, e2);
        Clipper.SwapPolyIndexes(e1, e2);
      }
    }
    else if (e2Contributing) {
      if (e1Wc === 0 || e1Wc === 1) {
        this.AddOutPt(e2, pt);
        Clipper.SwapSides(e1, e2);
        Clipper.SwapPolyIndexes(e1, e2);
      }
    }
    else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1)) {
      //neither edge is currently contributing ...
      let e1Wc2: long = 0, e2Wc2: long = 0;
      switch (e1FillType2) {
        case PolyFillType.pftPositive:
          e1Wc2 = e1.WindCnt2;
          break;
        case PolyFillType.pftNegative:
          e1Wc2 = -e1.WindCnt2;
          break;
        default:
          e1Wc2 = Math.abs(e1.WindCnt2);
          break;
      }
      switch (e2FillType2) {
        case PolyFillType.pftPositive:
          e2Wc2 = e2.WindCnt2;
          break;
        case PolyFillType.pftNegative:
          e2Wc2 = -e2.WindCnt2;
          break;
        default:
          e2Wc2 = Math.abs(e2.WindCnt2);
          break;
      }

      if (e1.PolyTyp !== e2.PolyTyp) {
        this.AddLocalMinPoly(e1, e2, pt);
      }
      else if (e1Wc === 1 && e2Wc === 1) {
        switch (this.m_ClipType) {
          case ClipType.ctIntersection:
            if (e1Wc2 > 0 && e2Wc2 > 0) {
              this.AddLocalMinPoly(e1, e2, pt);
            }
            break;
          case ClipType.ctUnion:
            if (e1Wc2 <= 0 && e2Wc2 <= 0) {
              this.AddLocalMinPoly(e1, e2, pt);
            }
            break;
          case ClipType.ctDifference:
            if (e1.PolyTyp === PolyType.ptClip && e1Wc2 > 0 && e2Wc2 > 0 ||
              e1.PolyTyp === PolyType.ptSubject && e1Wc2 <= 0 && e2Wc2 <= 0) {
              this.AddLocalMinPoly(e1, e2, pt);
            }
            break;
          case ClipType.ctXor:
            this.AddLocalMinPoly(e1, e2, pt);
            break;
          default:
            break;
        }
      }
      else {
        Clipper.SwapSides(e1, e2);
      }
    }

    return pt;
  }

  //noinspection JSUnusedLocalSymbols
  private DeleteFromSEL(e: TEdge): void { // unused on the original
    const SelPrev = e.PrevInSEL;
    const SelNext = e.NextInSEL;
    if (SelPrev === undefined && SelNext === undefined && e !== this.m_SortedEdges) {
      return; //already deleted
    }
    if (SelPrev !== undefined) {
      SelPrev.NextInSEL = SelNext;
    }
    else {
      this.m_SortedEdges = SelNext;
    }
    if (SelNext !== undefined) {
      SelNext.PrevInSEL = SelPrev;
    }
    e.NextInSEL = undefined;
    e.PrevInSEL = undefined;
  }

  private ProcessHorizontals(): void {
    let horzEdge: TEdge | undefined; //m_SortedEdges;

    const popEdgeCheck = () => {
      const popRes = this.PopEdgeFromSelNoOut();
      horzEdge = popRes.e;
      return popRes.res;
    };

    while (popEdgeCheck()) {
      this.ProcessHorizontal(horzEdge!);
    }
  }

  private static GetHorzDirectionNoOut(HorzEdge: TEdge): { Dir: Direction, Left: long, Right: long } { // out Dir, out Left, out Right -> {Dir, Left, Right}
    if (HorzEdge.Bot.X < HorzEdge.Top.X) {
      return {
        Left: HorzEdge.Bot.X,
        Right: HorzEdge.Top.X,
        Dir: Direction.dLeftToRight,
      };
    }
    else {
      return {
        Left: HorzEdge.Top.X,
        Right: HorzEdge.Bot.X,
        Dir: Direction.dRightToLeft,
      };
    }
  }

  private ProcessHorizontal(horzEdge: TEdge): void {
    const IsOpen = horzEdge.WindDelta === 0;
    let {Dir: dir, Left: horzLeft, Right: horzRight} = Clipper.GetHorzDirectionNoOut(horzEdge);

    let eLastHorz = horzEdge, eMaxPair: TEdge | undefined;
    while (eLastHorz.NextInLML !== undefined && Clipper.IsHorizontal(eLastHorz.NextInLML)) {
      eLastHorz = eLastHorz.NextInLML;
    }
    if (eLastHorz.NextInLML === undefined) {
      eMaxPair = Clipper.GetMaximaPair(eLastHorz);
    }

    let currMax = this.m_Maxima;
    if (currMax !== undefined) {
      //get the first maxima in range (X) ...
      if (dir === Direction.dLeftToRight) {
        while (currMax !== undefined && currMax.X <= horzEdge.Bot.X) {
          currMax = currMax.Next;
        }
        if (currMax !== undefined && currMax.X >= eLastHorz.Top.X) {
          currMax = undefined;
        }
      }
      else {
        while (currMax.Next !== undefined && currMax.Next.X < horzEdge.Bot.X) {
          currMax = currMax.Next;
        }
        if (currMax.X <= eLastHorz.Top.X) {
          currMax = undefined;
        }
      }
    }

    let op1: OutPt | undefined;
    while (true) { //loop through consec. horizontal edges
      const IsLastHorz = horzEdge === eLastHorz;
      let e: TEdge | undefined = Clipper.GetNextInAEL(horzEdge, dir);
      while (e !== undefined) {
        //this code block inserts extra coords into horizontal edges (in output
        //polygons) whereever maxima touch these horizontal edges. This helps
        //'simplifying' polygons (ie if the Simplify property is set).
        if (currMax !== undefined) {
          if (dir === Direction.dLeftToRight) {
            while (currMax !== undefined && currMax.X < e.Curr.X) {
              if (horzEdge.OutIdx >= 0 && !IsOpen) {
                this.AddOutPt(horzEdge, newIntPoint(currMax.X, horzEdge.Bot.Y));
              }
              currMax = currMax.Next;
            }
          }
          else {
            while (currMax !== undefined && currMax.X > e.Curr.X) {
              if (horzEdge.OutIdx >= 0 && !IsOpen) {
                this.AddOutPt(horzEdge, newIntPoint(currMax.X, horzEdge.Bot.Y));
              }
              currMax = currMax.Prev;
            }
          }
        }

        if (dir === Direction.dLeftToRight && e.Curr.X > horzRight ||
          dir === Direction.dRightToLeft && e.Curr.X < horzLeft) {
          break;
        }

        //Also break if we've got to the end of an intermediate horizontal edge ...
        //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
        if (e.Curr.X === horzEdge.Top.X && horzEdge.NextInLML !== undefined &&
          e.Dx < horzEdge.NextInLML.Dx) {
          break;
        }

        if (horzEdge.OutIdx >= 0 && !IsOpen) { //note: may be done multiple times
          if (use_xyz) {
            if (dir === Direction.dLeftToRight) {
              e.Curr = this.SetZImmutable((e.Curr as IntPointXYZ), horzEdge, e);
            }
            else {
              e.Curr = this.SetZImmutable((e.Curr as IntPointXYZ), e, horzEdge);
            }
          }

          op1 = this.AddOutPt(horzEdge, e.Curr);
          let eNextHorz = this.m_SortedEdges;
          while (eNextHorz !== undefined) {
            if (eNextHorz.OutIdx >= 0 && Clipper.HorzSegmentsOverlap(horzEdge.Bot.X,
                horzEdge.Top.X, eNextHorz.Bot.X, eNextHorz.Top.X)) {
              const op2 = this.GetLastOutPt(eNextHorz);
              this.AddJoin(op2!, op1, eNextHorz.Top);
            }
            eNextHorz = eNextHorz.NextInSEL;
          }
          this.AddGhostJoin(op1, horzEdge.Bot);
        }

        //OK, so far we're still in range of the horizontal Edge  but make sure
        //we're at the last of consec. horizontals when matching with eMaxPair
        if (e === eMaxPair && IsLastHorz) {
          if (horzEdge.OutIdx >= 0) {
            this.AddLocalMaxPoly(horzEdge, eMaxPair!, horzEdge.Top);
          }
          this.DeleteFromAEL(horzEdge);
          this.DeleteFromAEL(eMaxPair!);
          return;
        }

        if (dir === Direction.dLeftToRight) {
          const Pt = newIntPoint(e.Curr.X, horzEdge.Curr.Y);
          // no need to save Pt = since we don't care about the new Z value
          this.IntersectEdgesImmutable(horzEdge, e, Pt);
        }
        else {
          const Pt = newIntPoint(e.Curr.X, horzEdge.Curr.Y);
          // no need to save Pt = since we don't care about the new Z value
          this.IntersectEdgesImmutable(e, horzEdge, Pt);
        }
        const eNext = Clipper.GetNextInAEL(e, dir);
        this.SwapPositionsInAEL(horzEdge, e);
        e = eNext;
      } //end while(e !== undefined)

      //Break out of loop if HorzEdge.NextInLML is not also horizontal ...
      if (horzEdge.NextInLML === undefined || !Clipper.IsHorizontal(horzEdge.NextInLML)) {
        break;
      }

      horzEdge = this.UpdateEdgeIntoAELNoRef(horzEdge);
      if (horzEdge.OutIdx >= 0) {
        this.AddOutPt(horzEdge, horzEdge.Bot);
      }
      const result = Clipper.GetHorzDirectionNoOut(horzEdge);
      dir = result.Dir;
      horzLeft = result.Left;
      horzRight = result.Right;
    }

    if (horzEdge.OutIdx >= 0 && op1 === undefined) {
      op1 = this.GetLastOutPt(horzEdge);
      let eNextHorz = this.m_SortedEdges;
      while (eNextHorz !== undefined) {
        if (eNextHorz.OutIdx >= 0 && Clipper.HorzSegmentsOverlap(horzEdge.Bot.X,
            horzEdge.Top.X, eNextHorz.Bot.X, eNextHorz.Top.X)) {
          const op2 = this.GetLastOutPt(eNextHorz);
          this.AddJoin(op2!, op1!, eNextHorz.Top);
        }
        eNextHorz = eNextHorz.NextInSEL;
      }
      this.AddGhostJoin(op1!, horzEdge.Top);
    }

    if (horzEdge.NextInLML !== undefined) {
      if (horzEdge.OutIdx >= 0) {
        op1 = this.AddOutPt(horzEdge, horzEdge.Top);

        horzEdge = this.UpdateEdgeIntoAELNoRef(horzEdge);
        if (horzEdge.WindDelta === 0) {
          return;
        }
        //nb: HorzEdge is no longer horizontal here
        const ePrev = horzEdge.PrevInAEL;
        const eNext = horzEdge.NextInAEL;
        if (ePrev !== undefined && ePrev.Curr.X === horzEdge.Bot.X &&
          ePrev.Curr.Y === horzEdge.Bot.Y && ePrev.WindDelta !== 0 && ePrev.OutIdx >= 0 && ePrev.Curr.Y > ePrev.Top.Y && ClipperBase.EdgeSlopesEqual(horzEdge, ePrev, this.m_UseFullRange)) {
          const op2 = this.AddOutPt(ePrev, horzEdge.Bot);
          this.AddJoin(op1, op2, horzEdge.Top);
        }
        else if (eNext !== undefined && eNext.Curr.X === horzEdge.Bot.X &&
          eNext.Curr.Y === horzEdge.Bot.Y && eNext.WindDelta !== 0 &&
          eNext.OutIdx >= 0 && eNext.Curr.Y > eNext.Top.Y &&
          ClipperBase.EdgeSlopesEqual(horzEdge, eNext, this.m_UseFullRange)) {
          const op2 = this.AddOutPt(eNext, horzEdge.Bot);
          this.AddJoin(op1, op2, horzEdge.Top);
        }
      }
      else {
        horzEdge = this.UpdateEdgeIntoAELNoRef(horzEdge);
      }
    }
    else {
      if (horzEdge.OutIdx >= 0) {
        this.AddOutPt(horzEdge, horzEdge.Top);
      }
      this.DeleteFromAEL(horzEdge);
    }
  }

  private static GetNextInAEL(e: TEdge, direction: Direction): TEdge | undefined {
    return direction === Direction.dLeftToRight ? e.NextInAEL : e.PrevInAEL;
  }

  //noinspection JSUnusedLocalSymbols
  private static IsMinima(e: TEdge | undefined): boolean { // unused in the original
    return e !== undefined && e.Prev!.NextInLML !== e && e.Next.NextInLML !== e;
  }

  private static IsMaxima(e: TEdge | undefined, Y: double): boolean {
    return e !== undefined && e.Top.Y === Y && e.NextInLML === undefined;
  }

  private static IsIntermediate(e: TEdge, Y: double): boolean {
    return e.Top.Y === Y && e.NextInLML !== undefined;
  }

  private static GetMaximaPair(e: TEdge): TEdge | undefined {
    if (intPointEquals(e.Next.Top, e.Top) && e.Next.NextInLML === undefined) {
      return e.Next;
    }
    else if (intPointEquals(e.Prev!.Top, e.Top) && e.Prev!.NextInLML === undefined) {
      return e.Prev;
    }
    else {
      return undefined;
    }
  }

  private static GetMaximaPairEx(e: TEdge): TEdge | undefined {
    //as above but returns undefined if MaxPair isn't in AEL (unless it's horizontal)
    const result = this.GetMaximaPair(e);
    if (result === undefined || result.OutIdx === Skip ||
      result.NextInAEL === result.PrevInAEL && !ClipperBase.IsHorizontal(result)) {
      return undefined;
    }
    return result;
  }

  private ProcessIntersections(topY: long): boolean {
    if (this.m_ActiveEdges === undefined) {
      return true;
    }
    //noinspection UnusedCatchParameterJS
    try {
      this.BuildIntersectList(topY);
      if (this.m_IntersectList.length === 0) {
        return true;
      }
      if (this.m_IntersectList.length === 1 || this.FixupIntersectionOrder()) {
        this.ProcessIntersectList();
      }
      else {
        return false;
      }
    }
    catch (err) {
      this.m_SortedEdges = undefined;
      this.m_IntersectList.length = 0;
      throw new ClipperError('ProcessIntersections error');
    }
    this.m_SortedEdges = undefined;
    return true;
  }

  private BuildIntersectList(topY: long): void {
    if (this.m_ActiveEdges === undefined) {
      return;
    }

    //prepare for sorting ...
    let e = this.m_ActiveEdges;
    this.m_SortedEdges = e;
    while (e !== undefined) {
      e.PrevInSEL = e.PrevInAEL;
      e.NextInSEL = e.NextInAEL;
      //e.Curr.X = TopX(e, topY);
      e.Curr = cloneIntPointWithX(e.Curr, TopX(e, topY));
      e = e.NextInAEL!;
    }

    //bubblesort ...
    let isModified = true;
    while (isModified && this.m_SortedEdges !== undefined) {
      isModified = false;
      e = this.m_SortedEdges;
      while (e.NextInSEL !== undefined) {
        const eNext = e.NextInSEL;
        if (e.Curr.X > eNext.Curr.X) {
          let pt: IntPoint = Clipper.IntersectPointNoOut(e, eNext);
          if (pt.Y < topY) {
            //pt.X = TopX(e, topY);
            //pt.Y = topY;
            // no need to clone since the point Z is generated by us
            pt = newIntPoint(TopX(e, topY), topY);
          }
          const newNode = new IntersectNode();
          newNode.Edge1 = e;
          newNode.Edge2 = eNext;
          newNode.Pt = cloneIntPoint(pt);
          this.m_IntersectList.push(newNode);

          this.SwapPositionsInSEL(e, eNext);
          isModified = true;
        }
        else {
          e = eNext;
        }
      }
      if (e.PrevInSEL !== undefined) {
        e.PrevInSEL.NextInSEL = undefined;
      }
      else {
        break;
      }
    }
    this.m_SortedEdges = undefined;
  }

  private static EdgesAdjacent(inode: IntersectNode): boolean {
    return inode.Edge1.NextInSEL === inode.Edge2 ||
      inode.Edge1.PrevInSEL === inode.Edge2;
  }

  //noinspection JSUnusedLocalSymbols
  private static IntersectNodeSort(node1: IntersectNode, node2: IntersectNode): int { // unused in the original
    //the following typecast is safe because the differences in Pt.Y will
    //be limited to the height of the scanbeam.
    return (node2.Pt.Y - node1.Pt.Y);
  }

  private FixupIntersectionOrder(): boolean {
    //pre-condition: intersections are sorted bottom-most first.
    //Now it's crucial that intersections are made only between adjacent edges,
    //so to ensure this the order of intersections may need adjusting ...
    this.m_IntersectList.sort(this.m_IntersectNodeComparer);

    this.CopyAELToSEL();
    const cnt = this.m_IntersectList.length;
    for (let i: int = 0; i < cnt; i++) {
      if (!Clipper.EdgesAdjacent(this.m_IntersectList[i])) {
        let j: int = i + 1;
        while (j < cnt && !Clipper.EdgesAdjacent(this.m_IntersectList[j])) {
          j++;
        }
        if (j === cnt) {
          return false;
        }

        const tmp = this.m_IntersectList[i];
        this.m_IntersectList[i] = this.m_IntersectList[j];
        this.m_IntersectList[j] = tmp;
      }
      this.SwapPositionsInSEL(this.m_IntersectList[i].Edge1, this.m_IntersectList[i].Edge2);
    }
    return true;
  }

  private ProcessIntersectList(): void {
    for (let i: int = 0; i < this.m_IntersectList.length; i++) {
      const iNode = this.m_IntersectList[i];
      iNode.Pt = this.IntersectEdgesImmutable(iNode.Edge1, iNode.Edge2, iNode.Pt);
      this.SwapPositionsInAEL(iNode.Edge1, iNode.Edge2);
    }
    this.m_IntersectList.length = 0;
  }

  private static IntersectPointNoOut(edge1: TEdge, edge2: TEdge): IntPoint { // out ip -> return ip
    let ipX: cInt = 0, ipY: cInt = 0;
    let b1: double = 0, b2: double = 0;
    //nb: with very large coordinate values, it's possible for SlopesEqual() to
    //return false but for the edge.Dx value be equal due to double precision rounding.
    if (edge1.Dx === edge2.Dx) {
      ipY = edge1.Curr.Y;
      ipX = TopX(edge1, ipY);
      return newIntPoint(ipX, ipY);
    }

    if (edge1.Delta.X === 0) {
      ipX = edge1.Bot.X;
      if (Clipper.IsHorizontal(edge2)) {
        ipY = edge2.Bot.Y;
      }
      else {
        b2 = edge2.Bot.Y - edge2.Bot.X / edge2.Dx;
        ipY = Round(ipX / edge2.Dx + b2);
      }
    }
    else if (edge2.Delta.X === 0) {
      ipX = edge2.Bot.X;
      if (Clipper.IsHorizontal(edge1)) {
        ipY = edge1.Bot.Y;
      }
      else {
        b1 = edge1.Bot.Y - edge1.Bot.X / edge1.Dx;
        ipY = Round(ipX / edge1.Dx + b1);
      }
    }
    else {
      b1 = edge1.Bot.X - edge1.Bot.Y * edge1.Dx;
      b2 = edge2.Bot.X - edge2.Bot.Y * edge2.Dx;
      const q: double = (b2 - b1) / (edge1.Dx - edge2.Dx);
      ipY = Round(q);
      if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx)) {
        ipX = Round(edge1.Dx * q + b1);
      }
      else {
        ipX = Round(edge2.Dx * q + b2);
      }
    }

    if (ipY < edge1.Top.Y || ipY < edge2.Top.Y) {
      if (edge1.Top.Y > edge2.Top.Y) {
        ipY = edge1.Top.Y;
      }
      else {
        ipY = edge2.Top.Y;
      }
      if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx)) {
        ipX = TopX(edge1, ipY);
      }
      else {
        ipX = TopX(edge2, ipY);
      }
    }
    //finally, don't allow 'ip' to be BELOW curr.Y (ie bottom of scanbeam) ...
    if (ipY > edge1.Curr.Y) {
      ipY = edge1.Curr.Y;
      //better to use the more vertical edge to derive X ...
      if (Math.abs(edge1.Dx) > Math.abs(edge2.Dx)) {
        ipX = TopX(edge2, ipY);
      }
      else {
        ipX = TopX(edge1, ipY);
      }
    }

    return newIntPoint(ipX, ipY);
  }

  private ProcessEdgesAtTopOfScanbeam(topY: long): void {
    let e = this.m_ActiveEdges;
    while (e !== undefined) {
      //1. process maxima, treating them as if they're 'bent' horizontal edges,
      //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
      let IsMaximaEdge = Clipper.IsMaxima(e, topY);

      if (IsMaximaEdge) {
        const eMaxPair = Clipper.GetMaximaPairEx(e);
        IsMaximaEdge = eMaxPair === undefined || !Clipper.IsHorizontal(eMaxPair);
      }

      if (IsMaximaEdge) {
        if (this.StrictlySimple) {
          this.InsertMaxima(e.Top.X);
        }
        const ePrev = e.PrevInAEL;
        this.DoMaxima(e);
        if (ePrev === undefined) {
          e = this.m_ActiveEdges;
        }
        else {
          e = ePrev.NextInAEL;
        }
      }
      else {
        //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
        if (Clipper.IsIntermediate(e, topY) && Clipper.IsHorizontal(e.NextInLML!)) {
          e = this.UpdateEdgeIntoAELNoRef(e);
          if (e.OutIdx >= 0) {
            this.AddOutPt(e, e.Bot);
          }
          this.AddEdgeToSEL(e);
        }
        else {
          //e.Curr.X = TopX(e, topY);
          //e.Curr.Y = topY;
          const newX = TopX(e, topY);
          const newY = topY;

          if (use_xyz) {
            let newZ = 0;
            if (e.Top.Y === topY) newZ = (e.Top as IntPointXYZ).Z;
            else if (e.Bot.Y === topY) newZ = (e.Bot as IntPointXYZ).Z;
            //else newZ = 0;

            e.Curr = newIntPointXYZ(newX, newY, newZ);
          }
          else {
            e.Curr = newIntPointXY(newX, newY);
          }
        }
        //When StrictlySimple and 'e' is being touched by another edge, then
        //make sure both edges have a vertex here ...
        if (this.StrictlySimple) {
          const ePrev = e.PrevInAEL;
          if (e.OutIdx >= 0 && e.WindDelta !== 0 && ePrev !== undefined &&
            ePrev.OutIdx >= 0 && ePrev.Curr.X === e.Curr.X &&
            ePrev.WindDelta !== 0) {
            let ip = cloneIntPoint(e.Curr);
            if (use_xyz) {
              ip = this.SetZImmutable((ip as IntPointXYZ), ePrev, e);
            }
            const op = this.AddOutPt(ePrev, ip);
            const op2 = this.AddOutPt(e, ip);
            this.AddJoin(op, op2, ip); //StrictlySimple (type-3) join
          }
        }

        e = e.NextInAEL;
      }
    }

    //3. Process horizontals at the Top of the scanbeam ...
    this.ProcessHorizontals();
    this.m_Maxima = undefined;

    //4. Promote intermediate vertices ...
    e = this.m_ActiveEdges;
    while (e !== undefined) {
      if (Clipper.IsIntermediate(e, topY)) {
        let op: OutPt | undefined;
        if (e.OutIdx >= 0) {
          op = this.AddOutPt(e, e.Top);
        }
        e = this.UpdateEdgeIntoAELNoRef(e);

        //if output polygons share an edge, they'll need joining later ...
        const ePrev = e.PrevInAEL;
        const eNext = e.NextInAEL;
        if (ePrev !== undefined && ePrev.Curr.X === e.Bot.X &&
          ePrev.Curr.Y === e.Bot.Y && op !== undefined &&
          ePrev.OutIdx >= 0 && ePrev.Curr.Y > ePrev.Top.Y &&
          ClipperBase.IntPoint4SlopesEqual(e.Curr, e.Top, ePrev.Curr, ePrev.Top, this.m_UseFullRange) &&
          e.WindDelta !== 0 && ePrev.WindDelta !== 0) {
          const op2 = this.AddOutPt(ePrev, e.Bot);
          this.AddJoin(op, op2, e.Top);
        }
        else if (eNext !== undefined && eNext.Curr.X === e.Bot.X &&
          eNext.Curr.Y === e.Bot.Y && op !== undefined &&
          eNext.OutIdx >= 0 && eNext.Curr.Y > eNext.Top.Y &&
          ClipperBase.IntPoint4SlopesEqual(e.Curr, e.Top, eNext.Curr, eNext.Top, this.m_UseFullRange) &&
          e.WindDelta !== 0 && eNext.WindDelta !== 0) {
          const op2 = this.AddOutPt(eNext, e.Bot);
          this.AddJoin(op, op2, e.Top);
        }
      }
      e = e.NextInAEL;
    }
  }

  private DoMaxima(e: TEdge): void {
    const eMaxPair = Clipper.GetMaximaPairEx(e);
    if (eMaxPair === undefined) {
      if (e.OutIdx >= 0) {
        this.AddOutPt(e, e.Top);
      }
      this.DeleteFromAEL(e);
      return;
    }

    let eNext = e.NextInAEL;
    while (eNext !== undefined && eNext !== eMaxPair) {
      e.Top = this.IntersectEdgesImmutable(e, eNext, e.Top);
      this.SwapPositionsInAEL(e, eNext);
      eNext = e.NextInAEL;
    }

    if (e.OutIdx === Unassigned && eMaxPair.OutIdx === Unassigned) {
      this.DeleteFromAEL(e);
      this.DeleteFromAEL(eMaxPair);
    }
    else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0) {
      if (e.OutIdx >= 0) {
        this.AddLocalMaxPoly(e, eMaxPair, e.Top);
      }
      this.DeleteFromAEL(e);
      this.DeleteFromAEL(eMaxPair);
    }
    else if (use_lines && e.WindDelta === 0) {
      if (e.OutIdx >= 0) {
        this.AddOutPt(e, e.Top);
        e.OutIdx = Unassigned;
      }
      this.DeleteFromAEL(e);

      if (eMaxPair.OutIdx >= 0) {
        this.AddOutPt(eMaxPair, e.Top);
        eMaxPair.OutIdx = Unassigned;
      }
      this.DeleteFromAEL(eMaxPair);
    }
    else {
      throw new ClipperError('DoMaxima error');
    }
  }

  public static ReversePaths(polys: Paths): void {
    for (let ii = 0, max = polys.length; ii < max; ii++) {
      polys[ii].reverse();
    }
  }

  public static Orientation(poly: Path): boolean {
    return Clipper.Area(poly) >= 0;
  }

  private static PointCount(pts: OutPt | undefined): int {
    if (pts === undefined) {
      return 0;
    }
    let result: int = 0;
    let p = pts;
    do {
      result++;
      p = p.Next;
    } while (p !== pts);
    return result;
  }

  private BuildResult(polyg: Paths): void {
    polyg.length = this.m_PolyOuts.length;
    let finalLength = 0;
    for (let i: int = 0; i < this.m_PolyOuts.length; i++) {
      const outRec = this.m_PolyOuts[i];
      if (outRec!.Pts === undefined) {
        continue;
      }
      let p = outRec!.Pts!.Prev;
      const cnt = Clipper.PointCount(p);
      if (cnt < 2) {
        continue;
      }
      const pg: Path = [];
      pg.length = cnt;
      for (let j: int = 0; j < cnt; j++) {
        pg.push(cloneIntPoint(p.Pt));
        p = p.Prev;
      }
      polyg[finalLength++] = pg;
    }
    polyg.length = finalLength;
  }

  private BuildResult2(polytree: PolyTree): void {
    polytree.Clear();

    //add each output polygon/contour to polytree ...
    polytree.m_AllPolys.length = this.m_PolyOuts.length;
    let allPolysLength = 0;
    for (let i: int = 0; i < this.m_PolyOuts.length; i++) {
      const outRec: OutRec = this.m_PolyOuts[i]!;
      const cnt = Clipper.PointCount(outRec.Pts);
      if (outRec.IsOpen && cnt < 2 ||
        !outRec.IsOpen && cnt < 3) {
        continue;
      }
      Clipper.FixHoleLinkage(outRec);
      const pn = new PolyNode();
      polytree.m_AllPolys[allPolysLength++] = pn;
      outRec.PolyNode = pn;
      pn.m_polygon.length = cnt;
      let op = outRec.Pts!.Prev;
      for (let j: int = 0; j < cnt; j++) {
        pn.m_polygon[j] = cloneIntPoint(op.Pt);
        op = op.Prev;
      }
    }
    polytree.m_AllPolys.length = allPolysLength;

    //fixup PolyNode links etc ...
    //polytree.m_Childs.Capacity = this.m_PolyOuts.length;
    for (let i = 0; i < this.m_PolyOuts.length; i++) {
      const outRec = this.m_PolyOuts[i]!;
      if (outRec.PolyNode === undefined) {
        //continue;
      }
      else if (outRec.IsOpen) {
        outRec.PolyNode.IsOpen = true;
        polytree.AddChild(outRec.PolyNode);
      }
      else if (outRec.FirstLeft !== undefined &&
        outRec.FirstLeft.PolyNode !== undefined) {
        outRec.FirstLeft.PolyNode.AddChild(outRec.PolyNode);
      }
      else {
        polytree.AddChild(outRec.PolyNode);
      }
    }
  }

  private static FixupOutPolyline(outrec: OutRec): void {
    let pp = outrec.Pts!;
    let lastPP = pp.Prev;
    while (pp !== lastPP) {
      pp = pp.Next;
      if (intPointEquals(pp.Pt, pp.Prev.Pt)) {
        if (pp === lastPP) {
          lastPP = pp.Prev;
        }
        const tmpPP = pp.Prev;
        tmpPP.Next = pp.Next;
        pp.Next.Prev = tmpPP;
        pp = tmpPP;
      }
    }
    if (pp === pp.Prev) {
      outrec.Pts = undefined;
    }
  }

  private FixupOutPolygon(outRec: OutRec): void {
    //FixupOutPolygon() - removes duplicate points and simplifies consecutive
    //parallel edges by removing the middle vertex.
    let lastOK: OutPt | undefined;
    outRec.BottomPt = undefined;
    let pp = outRec.Pts!;
    const preserveCol = this.PreserveCollinear || this.StrictlySimple;
    while (true) {
      if (pp.Prev === pp || pp.Prev === pp.Next) {
        outRec.Pts = undefined;
        return;
      }
      //test for duplicate points and collinear edges ...
      if (intPointEquals(pp.Pt, pp.Next.Pt) || intPointEquals(pp.Pt, pp.Prev.Pt) ||
        ClipperBase.IntPoint3SlopesEqual(pp.Prev.Pt, pp.Pt, pp.Next.Pt, this.m_UseFullRange) &&
        (!preserveCol || !ClipperBase.Pt2IsBetweenPt1AndPt3(pp.Prev.Pt, pp.Pt, pp.Next.Pt))) {
        lastOK = undefined;
        pp.Prev.Next = pp.Next;
        pp.Next.Prev = pp.Prev;
        pp = pp.Prev;
      }
      else if (pp === lastOK) {
        break;
      }
      else {
        if (lastOK === undefined) {
          lastOK = pp;
        }
        pp = pp.Next;
      }
    }
    outRec.Pts = pp;
  }

  private static DupOutPt(outPt: OutPt, InsertAfter: boolean): OutPt {
    const result = new OutPt();
    result.Pt = cloneIntPoint(outPt.Pt);
    result.Idx = outPt.Idx;
    if (InsertAfter) {
      result.Next = outPt.Next;
      result.Prev = outPt;
      outPt.Next.Prev = result;
      outPt.Next = result;
    }
    else {
      result.Prev = outPt.Prev;
      result.Next = outPt;
      outPt.Prev.Next = result;
      outPt.Prev = result;
    }
    return result;
  }

  private static GetOverlapNoOut(a1: long, a2: long, b1: long, b2: long): { res: boolean, Left: long, Right: long } { // out Left, out Right: boolean - > {res, Left, Right}
    let Left: long, Right: long;
    if (a1 < a2) {
      if (b1 < b2) {
        Left = Math.max(a1, b1);
        Right = Math.min(a2, b2);
      }
      else {
        Left = Math.max(a1, b2);
        Right = Math.min(a2, b1);
      }
    }
    else {
      if (b1 < b2) {
        Left = Math.max(a2, b1);
        Right = Math.min(a1, b2);
      }
      else {
        Left = Math.max(a2, b2);
        Right = Math.min(a1, b1);
      }
    }
    return { res: Left < Right, Left: Left, Right: Right };
  }

  private static JoinHorz(op1: OutPt, op1b: OutPt, op2: OutPt, op2b: OutPt, Pt: IntPoint, DiscardLeft: boolean): boolean {
    const Dir1 = op1.Pt.X > op1b.Pt.X ? Direction.dRightToLeft : Direction.dLeftToRight;
    const Dir2 = op2.Pt.X > op2b.Pt.X ? Direction.dRightToLeft : Direction.dLeftToRight;
    if (Dir1 === Dir2) {
      return false;
    }

    //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
    //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
    //So, to facilitate this while inserting Op1b and Op2b ...
    //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
    //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
    if (Dir1 === Direction.dLeftToRight) {
      while (op1.Next.Pt.X <= Pt.X &&
      op1.Next.Pt.X >= op1.Pt.X && op1.Next.Pt.Y === Pt.Y) {
        op1 = op1.Next;
      }
      if (DiscardLeft && op1.Pt.X !== Pt.X) {
        op1 = op1.Next;
      }
      op1b = Clipper.DupOutPt(op1, !DiscardLeft);
      if (!intPointEquals(op1b.Pt, Pt)) {
        op1 = op1b;
        op1.Pt = cloneIntPoint(Pt);
        op1b = Clipper.DupOutPt(op1, !DiscardLeft);
      }
    }
    else {
      while (op1.Next.Pt.X >= Pt.X &&
      op1.Next.Pt.X <= op1.Pt.X && op1.Next.Pt.Y === Pt.Y) {
        op1 = op1.Next;
      }
      if (!DiscardLeft && op1.Pt.X !== Pt.X) {
        op1 = op1.Next;
      }
      op1b = Clipper.DupOutPt(op1, DiscardLeft);
      if (!intPointEquals(op1b.Pt, Pt)) {
        op1 = op1b;
        op1.Pt = cloneIntPoint(Pt);
        op1b = Clipper.DupOutPt(op1, DiscardLeft);
      }
    }

    if (Dir2 === Direction.dLeftToRight) {
      while (op2.Next.Pt.X <= Pt.X &&
      op2.Next.Pt.X >= op2.Pt.X && op2.Next.Pt.Y === Pt.Y) {
        op2 = op2.Next;
      }
      if (DiscardLeft && op2.Pt.X !== Pt.X) {
        op2 = op2.Next;
      }
      op2b = Clipper.DupOutPt(op2, !DiscardLeft);
      if (!intPointEquals(op2b.Pt, Pt)) {
        op2 = op2b;
        op2.Pt = cloneIntPoint(Pt);
        op2b = Clipper.DupOutPt(op2, !DiscardLeft);
      }
    }
    else {
      while (op2.Next.Pt.X >= Pt.X &&
      op2.Next.Pt.X <= op2.Pt.X && op2.Next.Pt.Y === Pt.Y) {
        op2 = op2.Next;
      }
      if (!DiscardLeft && op2.Pt.X !== Pt.X) {
        op2 = op2.Next;
      }
      op2b = Clipper.DupOutPt(op2, DiscardLeft);
      if (!intPointEquals(op2b.Pt, Pt)) {
        op2 = op2b;
        op2.Pt = cloneIntPoint(Pt);
        op2b = Clipper.DupOutPt(op2, DiscardLeft);
      }
    }

    if (Dir1 === Direction.dLeftToRight === DiscardLeft) {
      op1.Prev = op2;
      op2.Next = op1;
      op1b.Next = op2b;
      op2b.Prev = op1b;
    }
    else {
      op1.Next = op2;
      op2.Prev = op1;
      op1b.Prev = op2b;
      op2b.Next = op1b;
    }
    return true;
  }

  private JoinPoints(j: Join, outRec1: OutRec, outRec2: OutRec): boolean {
    let op1 = j.OutPt1;
    let op1b: OutPt | undefined;
    let op2 = j.OutPt2;
    let op2b: OutPt | undefined;


    //There are 3 kinds of joins for output polygons ...
    //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are vertices anywhere
    //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
    //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
    //location at the Bottom of the overlapping segment (& Join.OffPt is above).
    //3. StrictlySimple joins where edges touch but are not collinear and where
    //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
    const isHorizontal = j.OutPt1.Pt.Y === j.OffPt.Y;

    if (isHorizontal && intPointEquals(j.OffPt, j.OutPt1.Pt) && intPointEquals(j.OffPt, j.OutPt2.Pt)) {
      //Strictly Simple join ...
      if (outRec1 !== outRec2) {
        return false;
      }
      op1b = j.OutPt1.Next;
      while (op1b !== op1 && intPointEquals(op1b.Pt, j.OffPt)) {
        op1b = op1b.Next;
      }
      const reverse1 = op1b.Pt.Y > j.OffPt.Y;
      op2b = j.OutPt2.Next;
      while (op2b !== op2 && intPointEquals(op2b.Pt, j.OffPt)) {
        op2b = op2b.Next;
      }
      const reverse2 = op2b.Pt.Y > j.OffPt.Y;
      if (reverse1 === reverse2) {
        return false;
      }
      if (reverse1) {
        op1b = Clipper.DupOutPt(op1, false);
        op2b = Clipper.DupOutPt(op2, true);
        op1.Prev = op2;
        op2.Next = op1;
        op1b.Next = op2b;
        op2b.Prev = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      }
      else {
        op1b = Clipper.DupOutPt(op1, true);
        op2b = Clipper.DupOutPt(op2, false);
        op1.Next = op2;
        op2.Prev = op1;
        op1b.Prev = op2b;
        op2b.Next = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      }
    }
    else if (isHorizontal) {
      //treat horizontal joins differently to non-horizontal joins since with
      //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
      //may be anywhere along the horizontal edge.
      op1b = op1;
      while (op1.Prev.Pt.Y === op1.Pt.Y && op1.Prev !== op1b && op1.Prev !== op2) {
        op1 = op1.Prev;
      }
      while (op1b.Next.Pt.Y === op1b.Pt.Y && op1b.Next !== op1 && op1b.Next !== op2) {
        op1b = op1b.Next;
      }
      if (op1b.Next === op1 || op1b.Next === op2) {
        return false; //a flat 'polygon'
      }

      op2b = op2;
      while (op2.Prev.Pt.Y === op2.Pt.Y && op2.Prev !== op2b && op2.Prev !== op1b) {
        op2 = op2.Prev;
      }
      while (op2b.Next.Pt.Y === op2b.Pt.Y && op2b.Next !== op2 && op2b.Next !== op1) {
        op2b = op2b.Next;
      }
      if (op2b.Next === op2 || op2b.Next === op1) {
        return false; //a flat 'polygon'
      }

      //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges
      const { res, Left, Right } = Clipper.GetOverlapNoOut(op1.Pt.X, op1b.Pt.X, op2.Pt.X, op2b.Pt.X);
      if (!res) {
        return false;
      }

      //DiscardLeftSide: when overlapping edges are joined, a spike will created
      //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
      //on the discard Side as either may still be needed for other joins ...
      let Pt: IntPoint;
      let DiscardLeftSide: boolean;
      if (op1.Pt.X >= Left && op1.Pt.X <= Right) {
        Pt = cloneIntPoint(op1.Pt);
        DiscardLeftSide = op1.Pt.X > op1b.Pt.X;
      }
      else if (op2.Pt.X >= Left && op2.Pt.X <= Right) {
        Pt = cloneIntPoint(op2.Pt);
        DiscardLeftSide = op2.Pt.X > op2b.Pt.X;
      }
      else if (op1b.Pt.X >= Left && op1b.Pt.X <= Right) {
        Pt = cloneIntPoint(op1b.Pt);
        DiscardLeftSide = op1b.Pt.X > op1.Pt.X;
      }
      else {
        Pt = cloneIntPoint(op2b.Pt);
        DiscardLeftSide = op2b.Pt.X > op2.Pt.X;
      }
      j.OutPt1 = op1;
      j.OutPt2 = op2;
      return Clipper.JoinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
    }
    else {
      //nb: For non-horizontal joins ...
      //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
      //    2. Jr.OutPt1.Pt > Jr.OffPt.Y

      //make sure the polygons are correctly oriented ...
      op1b = op1.Next;
      while (intPointEquals(op1b.Pt, op1.Pt) && op1b !== op1) {
        op1b = op1b.Next;
      }
      const Reverse1 = op1b.Pt.Y > op1.Pt.Y ||
        !ClipperBase.IntPoint3SlopesEqual(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange);
      if (Reverse1) {
        op1b = op1.Prev;
        while (intPointEquals(op1b.Pt, op1.Pt) && op1b !== op1) {
          op1b = op1b.Prev;
        }
        if (op1b.Pt.Y > op1.Pt.Y ||
          !ClipperBase.IntPoint3SlopesEqual(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange)) {
          return false;
        }
      }

      op2b = op2.Next;
      while (intPointEquals(op2b.Pt, op2.Pt) && op2b !== op2) {
        op2b = op2b.Next;
      }
      const Reverse2 = op2b.Pt.Y > op2.Pt.Y ||
        !ClipperBase.IntPoint3SlopesEqual(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange);
      if (Reverse2) {
        op2b = op2.Prev;
        while (intPointEquals(op2b.Pt, op2.Pt) && op2b !== op2) {
          op2b = op2b.Prev;
        }
        if (op2b.Pt.Y > op2.Pt.Y ||
          !ClipperBase.IntPoint3SlopesEqual(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange)) {
          return false;
        }
      }

      if (op1b === op1 || op2b === op2 || op1b === op2b ||
        outRec1 === outRec2 && Reverse1 === Reverse2) {
        return false;
      }

      if (Reverse1) {
        op1b = Clipper.DupOutPt(op1, false);
        op2b = Clipper.DupOutPt(op2, true);
        op1.Prev = op2;
        op2.Next = op1;
        op1b.Next = op2b;
        op2b.Prev = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      }
      else {
        op1b = Clipper.DupOutPt(op1, true);
        op2b = Clipper.DupOutPt(op2, false);
        op1.Next = op2;
        op2.Prev = op1;
        op1b.Prev = op2b;
        op2b.Next = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      }
    }
  }

  public static PointInPolygon(pt: IntPoint, path: Path): int {
    //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
    //See "The Point in Polygon Problem for Arbitrary Polygons" by Hormann & Agathos
    //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
    let result: int = 0;
    const cnt: int = path.length;
    if (cnt < 3) {
      return 0;
    }
    let ip = path[0];
    for (let i: int = 1; i <= cnt; ++i) {
      const ipNext = i === cnt ? path[0] : path[i];
      if (ipNext.Y === pt.Y) {
        if (ipNext.X === pt.X || ip.Y === pt.Y &&
          ipNext.X > pt.X === ip.X < pt.X) {
          return -1;
        }
      }
      if (ip.Y < pt.Y !== ipNext.Y < pt.Y) {
        if (ip.X >= pt.X) {
          if (ipNext.X > pt.X) {
            result = 1 - result;
          }
          else {
            const d: double = (ip.X - pt.X) * (ipNext.Y - pt.Y) -
              (ipNext.X - pt.X) * (ip.Y - pt.Y);
            if (d === 0) {
              return -1;
            }
            else if (d > 0 === ipNext.Y > ip.Y) {
              result = 1 - result;
            }
          }
        }
        else {
          if (ipNext.X > pt.X) {
            const d: double = (ip.X - pt.X) * (ipNext.Y - pt.Y) -
              (ipNext.X - pt.X) * (ip.Y - pt.Y);
            if (d === 0) {
              return -1;
            }
            else if (d > 0 === ipNext.Y > ip.Y) {
              result = 1 - result;
            }
          }
        }
      }
      ip = ipNext;
    }
    return result;
  }

  //See "The Point in Polygon Problem for Arbitrary Polygons" by Hormann & Agathos
  //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
  private static PointInPolygonOutPt(pt: IntPoint, op: OutPt): int {
    //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
    let result: int = 0;
    const startOp = op;
    const ptx = pt.X, pty = pt.Y;
    let poly0x = op.Pt.X, poly0y = op.Pt.Y;
    do {
      op = op.Next;
      const poly1x = op.Pt.X, poly1y = op.Pt.Y;

      if (poly1y === pty) {
        if (poly1x === ptx || poly0y === pty &&
          poly1x > ptx === poly0x < ptx) {
          return -1;
        }
      }
      if (poly0y < pty !== poly1y < pty) {
        if (poly0x >= ptx) {
          if (poly1x > ptx) {
            result = 1 - result;
          }
          else {
            const d: double = (poly0x - ptx) * (poly1y - pty) -
              (poly1x - ptx) * (poly0y - pty);
            if (d === 0) {
              return -1;
            }
            if (d > 0 === poly1y > poly0y) {
              result = 1 - result;
            }
          }
        }
        else {
          if (poly1x > ptx) {
            const d: double = (poly0x - ptx) * (poly1y - pty) -
              (poly1x - ptx) * (poly0y - pty);
            if (d === 0) {
              return -1;
            }
            if (d > 0 === poly1y > poly0y) {
              result = 1 - result;
            }
          }
        }
      }
      poly0x = poly1x;
      poly0y = poly1y;
    } while (startOp !== op);
    return result;
  }

  private static Poly2ContainsPoly1(outPt1: OutPt, outPt2: OutPt): boolean {
    let op = outPt1;
    do {
      //nb: PointInPolygon returns 0 if false, +1 if true, -1 if pt on polygon
      const res = Clipper.PointInPolygonOutPt(op.Pt, outPt2);
      if (res >= 0) {
        return res > 0;
      }
      op = op.Next;
    } while (op !== outPt1);
    return true;
  }

  private FixupFirstLefts1(OldOutRec: OutRec, NewOutRec: OutRec): void {
    for (let ii = 0, max = this.m_PolyOuts.length; ii < max; ii++) {
      const outRec = this.m_PolyOuts[ii];
      const firstLeft = Clipper.ParseFirstLeft(outRec!.FirstLeft);
      if (outRec!.Pts !== undefined && firstLeft === OldOutRec) {
        if (Clipper.Poly2ContainsPoly1(outRec!.Pts!, NewOutRec.Pts!)) {
          outRec!.FirstLeft = NewOutRec;
        }
      }
    }
  }

  private FixupFirstLefts2(innerOutRec: OutRec, outerOutRec: OutRec): void {
    //A polygon has split into two such that one is now the inner of the other.
    //It's possible that these polygons now wrap around other polygons, so check
    //every polygon that's also contained by OuterOutRec's FirstLeft container
    //(including nil) to see if they've become inner to the new inner polygon ...
    const orfl = outerOutRec.FirstLeft;
    for (let ii = 0, max = this.m_PolyOuts.length; ii < max; ii++) {
      const outRec = this.m_PolyOuts[ii];
      if (outRec!.Pts === undefined || outRec === outerOutRec || outRec === innerOutRec) {
        continue;
      }
      const firstLeft = Clipper.ParseFirstLeft(outRec!.FirstLeft);
      if (firstLeft !== orfl && firstLeft !== innerOutRec && firstLeft !== outerOutRec) {
        continue;
      }
      if (Clipper.Poly2ContainsPoly1(outRec!.Pts!, innerOutRec!.Pts!)) {
        outRec!.FirstLeft = innerOutRec;
      }
      else if (Clipper.Poly2ContainsPoly1(outRec!.Pts!, outerOutRec!.Pts!)) {
        outRec!.FirstLeft = outerOutRec;
      }
      else if (outRec!.FirstLeft === innerOutRec || outRec!.FirstLeft === outerOutRec) {
        outRec!.FirstLeft = orfl;
      }
    }
  }

  private FixupFirstLefts3(OldOutRec: OutRec, NewOutRec: OutRec): void {
    //same as FixupFirstLefts1 but doesn't call Poly2ContainsPoly1()
    for (let ii = 0, max = this.m_PolyOuts.length; ii < max; ii++) {
      const outRec = this.m_PolyOuts[ii];
      const firstLeft = Clipper.ParseFirstLeft(outRec!.FirstLeft);
      if (outRec!.Pts !== undefined && firstLeft === OldOutRec) {
        outRec!.FirstLeft = NewOutRec;
      }
    }
  }

  private static ParseFirstLeft(FirstLeft: OutRec | undefined): OutRec | undefined {
    while (FirstLeft !== undefined && FirstLeft.Pts === undefined) {
      FirstLeft = FirstLeft.FirstLeft;
    }
    return FirstLeft;
  }

  private JoinCommonEdges(): void {
    for (let i = 0; i < this.m_Joins.length; i++) {
      const join = this.m_Joins[i];

      const outRec1 = this.GetOutRec(join.OutPt1.Idx);
      let outRec2 = this.GetOutRec(join.OutPt2.Idx);

      if (outRec1.Pts === undefined || outRec2.Pts === undefined) {
        continue;
      }
      if (outRec1.IsOpen || outRec2.IsOpen) {
        continue;
      }

      //get the polygon fragment with the correct hole state (FirstLeft)
      //before calling JoinPoints() ...
      let holeStateRec: OutRec | undefined;
      if (outRec1 === outRec2) {
        holeStateRec = outRec1;
      }
      else if (Clipper.OutRec1RightOfOutRec2(outRec1, outRec2)) {
        holeStateRec = outRec2;
      }
      else if (Clipper.OutRec1RightOfOutRec2(outRec2, outRec1)) {
        holeStateRec = outRec1;
      }
      else {
        holeStateRec = Clipper.GetLowermostRec(outRec1, outRec2);
      }

      if (!this.JoinPoints(join, outRec1, outRec2)) {
        continue;
      }

      if (outRec1 === outRec2) {
        //instead of joining two polygons, we've just created a new one by
        //splitting one polygon into two.
        outRec1.Pts = join.OutPt1;
        outRec1.BottomPt = undefined;
        outRec2 = this.CreateOutRec();
        outRec2.Pts = join.OutPt2;

        //update all OutRec2.Pts Idx's ...
        Clipper.UpdateOutPtIdxs(outRec2);

        if (Clipper.Poly2ContainsPoly1(outRec2.Pts, outRec1.Pts)) {
          //outRec1 contains outRec2 ...
          outRec2.IsHole = !outRec1.IsHole;
          outRec2.FirstLeft = outRec1;

          if (this.m_UsingPolyTree) {
            this.FixupFirstLefts2(outRec2, outRec1);
          }

          if ((outRec2.IsHole !== this.ReverseSolution) === Clipper.AreaOutRec(outRec2) > 0) {
            Clipper.ReversePolyPtLinks(outRec2.Pts);
          }
        }
        else if (Clipper.Poly2ContainsPoly1(outRec1.Pts, outRec2.Pts)) {
          //outRec2 contains outRec1 ...
          outRec2.IsHole = outRec1.IsHole;
          outRec1.IsHole = !outRec2.IsHole;
          outRec2.FirstLeft = outRec1.FirstLeft;
          outRec1.FirstLeft = outRec2;

          if (this.m_UsingPolyTree) {
            this.FixupFirstLefts2(outRec1, outRec2);
          }

          if ((outRec1.IsHole !== this.ReverseSolution) === Clipper.AreaOutRec(outRec1) > 0) {
            Clipper.ReversePolyPtLinks(outRec1.Pts);
          }
        }
        else {
          //the 2 polygons are completely separate ...
          outRec2.IsHole = outRec1.IsHole;
          outRec2.FirstLeft = outRec1.FirstLeft;

          //fixup FirstLeft pointers that may need reassigning to OutRec2
          if (this.m_UsingPolyTree) {
            this.FixupFirstLefts1(outRec1, outRec2);
          }
        }
      }
      else {
        //joined 2 polygons together ...

        outRec2.Pts = undefined;
        outRec2.BottomPt = undefined;
        outRec2.Idx = outRec1.Idx;

        outRec1.IsHole = holeStateRec.IsHole;
        if (holeStateRec === outRec2) {
          outRec1.FirstLeft = outRec2.FirstLeft;
        }
        outRec2.FirstLeft = outRec1;

        //fixup FirstLeft pointers that may need reassigning to OutRec1
        if (this.m_UsingPolyTree) {
          this.FixupFirstLefts3(outRec2, outRec1);
        }
      }
    }
  }

  private static UpdateOutPtIdxs(outrec: OutRec): void {
    let op = outrec.Pts;
    do {
      op!.Idx = outrec.Idx;
      op = op!.Prev;
    } while (op !== outrec.Pts);
  }

  private DoSimplePolygons(): void {
    let i: int = 0;
    while (i < this.m_PolyOuts.length) {
      const outrec = this.m_PolyOuts[i++]!;
      let op = outrec.Pts!;
      if (op === undefined || outrec.IsOpen) {
        continue;
      }
      do { //for each Pt in Polygon until duplicate found do ...
        let op2 = op.Next;
        while (op2 !== outrec.Pts) {
          if (intPointEquals(op.Pt, op2.Pt) && op2.Next !== op && op2.Prev !== op) {
            //split the polygon into two ...
            const op3 = op.Prev;
            const op4 = op2.Prev;
            op.Prev = op4;
            op4.Next = op;
            op2.Prev = op3;
            op3.Next = op2;

            outrec.Pts = op;
            const outrec2 = this.CreateOutRec();
            outrec2.Pts = op2;
            Clipper.UpdateOutPtIdxs(outrec2);
            if (Clipper.Poly2ContainsPoly1(outrec2.Pts!, outrec.Pts)) {
              //OutRec2 is contained by OutRec1 ...
              outrec2.IsHole = !outrec.IsHole;
              outrec2.FirstLeft = outrec;
              if (this.m_UsingPolyTree) {
                this.FixupFirstLefts2(outrec2, outrec);
              }
            }
            else if (Clipper.Poly2ContainsPoly1(outrec.Pts, outrec2.Pts!)) {
              //OutRec1 is contained by OutRec2 ...
              outrec2.IsHole = outrec.IsHole;
              outrec.IsHole = !outrec2.IsHole;
              outrec2.FirstLeft = outrec.FirstLeft;
              outrec.FirstLeft = outrec2;
              if (this.m_UsingPolyTree) {
                this.FixupFirstLefts2(outrec, outrec2);
              }
            }
            else {
              //the 2 polygons are separate ...
              outrec2.IsHole = outrec.IsHole;
              outrec2.FirstLeft = outrec.FirstLeft;
              if (this.m_UsingPolyTree) {
                this.FixupFirstLefts1(outrec, outrec2);
              }
            }
            op2 = op; //ie get ready for the next iteration
          }
          op2 = op2.Next;
        }
        op = op.Next;
      } while (op !== outrec.Pts);
    }
  }

  public static Area(poly: Path): double {
    const cnt = poly.length;
    if (cnt < 3) {
      return 0;
    }
    let a: double = 0;
    for (let i = 0, j = cnt - 1; i < cnt; ++i) {
      a += (poly[j].X + poly[i].X) * (poly[j].Y - poly[i].Y);
      j = i;
    }
    return -a * 0.5;
  }

  private static AreaOutRec(outRec: OutRec): double {
    return Clipper.AreaOutPt(outRec.Pts);
  }

  private static AreaOutPt(op: OutPt | undefined): double {
    const opFirst = op;
    if (op === undefined) {
      return 0;
    }
    let a: double = 0;
    do {
      a += (op.Prev.Pt.X + op.Pt.X) * (op.Prev.Pt.Y - op.Pt.Y);
      op = op.Next;
    } while (op !== opFirst);
    return a * 0.5;
  }

  //------------------------------------------------------------------------------
  // SimplifyPolygon functions ...
  // Convert self-intersecting polygons into simple polygons
  //------------------------------------------------------------------------------

  public static SimplifyPolygon(poly: Path, fillType: PolyFillType = PolyFillType.pftEvenOdd): Paths {
    const result: Paths = [];
    const c = new Clipper();
    c.StrictlySimple = true;
    c.AddPath(poly, PolyType.ptSubject, true);
    c.ExecutePaths(ClipType.ctUnion, result, fillType, fillType);
    return result;
  }

  public static SimplifyPolygons(polys: Paths, fillType: PolyFillType = PolyFillType.pftEvenOdd): Paths {
    const result: Paths = [];
    const c = new Clipper();
    c.StrictlySimple = true;
    c.AddPaths(polys, PolyType.ptSubject, true);
    c.ExecutePaths(ClipType.ctUnion, result, fillType, fillType);
    return result;
  }

  //noinspection JSUnusedLocalSymbols
  private static DistanceSqrd(pt1: IntPoint, pt2: IntPoint): double { // unused in the original
    const dx = pt1.X - pt2.X;
    const dy = pt1.Y - pt2.Y;
    return dx * dx + dy * dy;
  }

  private static DistanceFromLineSqrd(pt: IntPoint, ln1: IntPoint, ln2: IntPoint): double {
    //The equation of a line in general form (Ax + By + C = 0)
    //given 2 points (x¹,y¹) & (x²,y²) is ...
    //(y¹ - y²)x + (x² - x¹)y + (y² - y¹)x¹ - (x² - x¹)y¹ = 0
    //A = (y¹ - y²); B = (x² - x¹); C = (y² - y¹)x¹ - (x² - x¹)y¹
    //perpendicular distance of point (x³,y³) = (Ax³ + By³ + C)/Sqrt(A² + B²)
    //see http://en.wikipedia.org/wiki/Perpendicular_distance
    const A: double = ln1.Y - ln2.Y;
    const B: double = ln2.X - ln1.X;
    let C: double = A * ln1.X + B * ln1.Y;
    C = A * pt.X + B * pt.Y - C;
    return C * C / (A * A + B * B);
  }

  private static SlopesNearCollinear(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint, distSqrd: double): boolean {
    //this function is more accurate when the point that's GEOMETRICALLY
    //between the other 2 points is the one that's tested for distance.
    //nb: with 'spikes', either pt1 or pt3 is geometrically between the other pts
    if (Math.abs(pt1.X - pt2.X) > Math.abs(pt1.Y - pt2.Y)) {
      if (pt1.X > pt2.X === pt1.X < pt3.X) {
        return Clipper.DistanceFromLineSqrd(pt1, pt2, pt3) < distSqrd;
      }
      else if (pt2.X > pt1.X === pt2.X < pt3.X) {
        return Clipper.DistanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
      }
      else {
        return Clipper.DistanceFromLineSqrd(pt3, pt1, pt2) < distSqrd;
      }
    }
    else {
      if (pt1.Y > pt2.Y === pt1.Y < pt3.Y) {
        return Clipper.DistanceFromLineSqrd(pt1, pt2, pt3) < distSqrd;
      }
      else if (pt2.Y > pt1.Y === pt2.Y < pt3.Y) {
        return Clipper.DistanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
      }
      else {
        return Clipper.DistanceFromLineSqrd(pt3, pt1, pt2) < distSqrd;
      }
    }
  }

  private static PointsAreClose(pt1: IntPoint, pt2: IntPoint, distSqrd: double): boolean {
    const dx: double = pt1.X - pt2.X;
    const dy: double = pt1.Y - pt2.Y;
    return dx * dx + dy * dy <= distSqrd;
  }

  private static ExcludeOp(op: OutPt): OutPt {
    const result = op.Prev;
    result.Next = op.Next;
    op.Next.Prev = result;
    result.Idx = 0;
    return result;
  }

  public static CleanPolygon(path: Path, distance: double = 1.1415): Path {
    //distance = proximity in units/pixels below which vertices will be stripped.
    //Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
    //both x & y coords within 1 unit, then the second vertex will be stripped.

    let cnt = path.length;

    if (cnt === 0) {
      return [];
    }

    const outPts: OutPt[] = [];
    outPts.length = cnt;
    for (let i = 0; i < cnt; ++i) {
      outPts[i] = new OutPt();
    }

    for (let i = 0; i < cnt; ++i) {
      outPts[i].Pt = path[i]; // no need to clone since we will clone it later anyway
      outPts[i].Next = outPts[(i + 1) % cnt];
      outPts[i].Next.Prev = outPts[i];
      outPts[i].Idx = 0;
    }

    const distSqrd: double = distance * distance;
    let op = outPts[0];
    while (op.Idx === 0 && op.Next !== op.Prev) {
      if (Clipper.PointsAreClose(op.Pt, op.Prev.Pt, distSqrd)) {
        op = Clipper.ExcludeOp(op);
        cnt--;
      }
      else if (Clipper.PointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd)) {
        Clipper.ExcludeOp(op.Next);
        op = Clipper.ExcludeOp(op);
        cnt -= 2;
      }
      else if (Clipper.SlopesNearCollinear(op.Prev.Pt, op.Pt, op.Next.Pt, distSqrd)) {
        op = Clipper.ExcludeOp(op);
        cnt--;
      }
      else {
        op.Idx = 1;
        op = op.Next;
      }
    }

    if (cnt < 3) {
      cnt = 0;
    }
    const result: Path = [];
    result.length = cnt;
    for (let i = 0; i < cnt; ++i) {
      result[i] = cloneIntPoint(op.Pt);
      op = op.Next;
    }
    //outPts = undefined; // not needed
    return result;
  }

  public static CleanPolygons(polys: Paths, distance: double = 1.1415): Paths {
    const result: Paths = [];
    result.length = polys.length;
    for (let i = 0; i < polys.length; i++) {
      result[i] = Clipper.CleanPolygon(polys[i], distance);
    }
    return result;
  }

  private static Minkowski(pattern: Path, path: Path, IsSum: boolean, IsClosed: boolean): Paths {
    const delta = IsClosed ? 1 : 0;
    const polyCnt = pattern.length;
    const pathCnt = path.length;
    const result: Paths = [];
    result.length = pathCnt;

    if (IsSum) {
      for (let i = 0; i < pathCnt; i++) {
        const p: Path = [];
        p.length = polyCnt;
        let pLength = 0;
        for (let ii = 0, max = pattern.length; ii < max; ii++) {
          const ip = pattern[ii];
          p[pLength++] = newIntPoint(path[i].X + ip.X, path[i].Y + ip.Y);
        }
        //p.length = pLength; // not needed
        result[i] = p;
      }
    }
    else {
      for (let i = 0; i < pathCnt; i++) {
        const p: Path = [];
        p.length = polyCnt;
        let pLength = 0;
        for (let ii = 0, max = pattern.length; ii < max; ii++) {
          const ip = pattern[ii];
          p[pLength++] = newIntPoint(path[i].X - ip.X, path[i].Y - ip.Y);
        }
        //p.length = pLength; // not needed
        result[i] = p;
      }
    }

    const quads: Paths = [];
    quads.length = (pathCnt - 1 + delta) * (polyCnt); // TODO: originally it is (pathCnt + delta) * (polyCnt + 1) for some reason
    let quadsLength = 0;

    for (let i = 0; i < pathCnt - 1 + delta; i++) {
      for (let j = 0; j < polyCnt; j++) {
        const quad: Path = [
          result[i % pathCnt][j % polyCnt],
          result[(i + 1) % pathCnt][j % polyCnt],
          result[(i + 1) % pathCnt][(j + 1) % polyCnt],
          result[i % pathCnt][(j + 1) % polyCnt],
        ];
        if (!Clipper.Orientation(quad)) {
          quad.reverse();
        }
        quads[quadsLength++] = quad;
      }
    }

    quads.length = quadsLength;
    return quads;
  }

  public static MinkowskiSumPath(pattern: Path, path: Path, pathIsClosed: boolean): Paths {
    const paths: Paths = Clipper.Minkowski(pattern, path, true, pathIsClosed);
    const c = new Clipper();
    c.AddPaths(paths, PolyType.ptSubject, true);
    c.ExecutePaths(ClipType.ctUnion, paths, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
    return paths;
  }

  private static TranslatePath(path: Path, delta: IntPoint): Path {
    const outPath: Path = [];
    outPath.length = path.length;
    for (let i = 0; i < path.length; i++) {
      outPath[i] = newIntPoint(path[i].X + delta.X, path[i].Y + delta.Y);
    }
    return outPath;
  }

  public static MinkowskiSumPaths(pattern: Path, paths: Paths, pathIsClosed: boolean): Paths {
    const solution: Paths = [];
    const c = new Clipper();
    for (let i = 0; i < paths.length; ++i) {
      const tmp = Clipper.Minkowski(pattern, paths[i], true, pathIsClosed);
      c.AddPaths(tmp, PolyType.ptSubject, true);
      if (pathIsClosed) {
        const path = Clipper.TranslatePath(paths[i], pattern[0]);
        c.AddPath(path, PolyType.ptClip, true);
      }
    }
    c.ExecutePaths(ClipType.ctUnion, solution,
      PolyFillType.pftNonZero, PolyFillType.pftNonZero);
    return solution;
  }

  public static MinkowskiDiff(poly1: Path, poly2: Path): Paths {
    const paths = Clipper.Minkowski(poly1, poly2, false, true);
    const c = new Clipper();
    c.AddPaths(paths, PolyType.ptSubject, true);
    c.ExecutePaths(ClipType.ctUnion, paths, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
    return paths;
  }

  public static PolyTreeToPaths(polytree: PolyTree): Paths {
    const result: Paths = [];
    //result.Capacity = polytree.Total;
    Clipper.AddPolyNodeToPaths(polytree, NodeType.ntAny, result);
    return result;
  }

  private static AddPolyNodeToPaths(polynode: PolyNode, nt: NodeType, paths: Paths): void {
    let match = true;
    switch (nt) {
      case NodeType.ntOpen: return;
      case NodeType.ntClosed:
        match = !polynode.IsOpen;
        break;
      default:
        break;
    }

    if (polynode.m_polygon.length > 0 && match) {
      paths.push(polynode.m_polygon);
    }
    for (let ii = 0, max = polynode.Childs.length; ii < max; ii++) {
      const pn = polynode.Childs[ii];
      Clipper.AddPolyNodeToPaths(pn, nt, paths);
    }
  }

  public static OpenPathsFromPolyTree(polytree: PolyTree): Paths {
    const result = [];
    result.length = polytree.ChildCount;
    let resultLength = 0;
    for (let i = 0; i < polytree.ChildCount; i++) {
      if (polytree.Childs[i].IsOpen) {
        result[resultLength++] = polytree.Childs[i].m_polygon;
      }
    }
    result.length = resultLength;
    return result;
  }

  public static ClosedPathsFromPolyTree(polytree: PolyTree): Paths {
    const result: Paths = [];
    //result.Capacity = polytree.Total;
    Clipper.AddPolyNodeToPaths(polytree, NodeType.ntClosed, result);
    return result;
  }
}


// clipperOffset

export interface DoublePoint { // struct
  readonly dX: double;
  readonly dY: double;
}


const two_pi = Math.PI * 2;
const def_arc_tolerance = 0.25;

export class ClipperOffset {
  private m_destPolys?: Paths;
  private m_srcPoly?: Path;
  private m_destPoly?: Path;
  private m_normals: DoublePoint[] = [];
  private m_delta: double = 0;
  private m_sinA: double = 0;
  private m_sin: double = 0;
  private m_cos: double = 0;
  private m_miterLim: double = 0;
  private m_StepsPerRad: double = 0;

  private m_lowest: IntPoint = emptyIntPoint;
  private m_polyNodes: PolyNode = new PolyNode();

  public ArcTolerance: double = 0;
  public MiterLimit: double = 0;

  public constructor(miterLimit: double = 2.0, arcTolerance: double = def_arc_tolerance) {
    this.MiterLimit = miterLimit;
    this.ArcTolerance = arcTolerance;
    //this.m_lowest.X = -1;
    this.m_lowest = cloneIntPointWithX(this.m_lowest, -1);
  }

  public Clear(): void {
    this.m_polyNodes.Childs.length = 0;
    //this.m_lowest.X = -1;
    this.m_lowest = cloneIntPointWithX(this.m_lowest, -1);
  }

  public AddPath(path: Path, joinType: JoinType, endType: EndType): void {
    let highI = path.length - 1;
    if (highI < 0) {
      return;
    }
    const newNode = new PolyNode();
    newNode.m_jointype = joinType;
    newNode.m_endtype = endType;

    //strip duplicate points from path and also get index to the lowest point ...
    if (endType === EndType.etClosedLine || endType === EndType.etClosedPolygon) {
      while (highI > 0 && intPointEquals(path[0], path[highI])) {
        highI--;
      }
    }
    //newNode.m_polygon.Capacity = highI + 1;
    newNode.m_polygon.push(path[0]);
    let j: int = 0, k: int = 0;
    for (let i = 1; i <= highI; i++) {
      if (!intPointEquals(newNode.m_polygon[j], path[i])) {
        j++;
        newNode.m_polygon.push(path[i]);
        if (path[i].Y > newNode.m_polygon[k].Y ||
          path[i].Y === newNode.m_polygon[k].Y &&
          path[i].X < newNode.m_polygon[k].X) {
          k = j;
        }
      }
    }
    if (endType === EndType.etClosedPolygon && j < 2) {
      return;
    }

    this.m_polyNodes.AddChild(newNode);

    //if this path's lowest pt is lower than all the others then update m_lowest
    if (endType !== EndType.etClosedPolygon) {
      return;
    }
    if (this.m_lowest.X < 0) {
      this.m_lowest = newIntPoint(this.m_polyNodes.ChildCount - 1, k);
    }
    else {
      const ip = this.m_polyNodes.Childs[this.m_lowest.X].m_polygon[this.m_lowest.Y];
      if (newNode.m_polygon[k].Y > ip.Y ||
        newNode.m_polygon[k].Y === ip.Y &&
        newNode.m_polygon[k].X < ip.X) {
        this.m_lowest = newIntPoint(this.m_polyNodes.ChildCount - 1, k);
      }
    }
  }

  public AddPaths(paths: Paths, joinType: JoinType, endType: EndType) {
    for (let ii = 0, max = paths.length; ii < max; ii++) {
      this.AddPath(paths[ii], joinType, endType);
    }
  }

  private FixOrientations(): void {
    //fixup orientations of all closed paths if the orientation of the
    //closed path with the lowermost vertex is wrong ...
    if (this.m_lowest.X >= 0 &&
      !Clipper.Orientation(this.m_polyNodes.Childs[this.m_lowest.X].m_polygon)) {
      for (let i = 0; i < this.m_polyNodes.ChildCount; i++) {
        const node = this.m_polyNodes.Childs[i];
        if (node.m_endtype === EndType.etClosedPolygon ||
          node.m_endtype === EndType.etClosedLine &&
          Clipper.Orientation(node.m_polygon)) {
          node.m_polygon.reverse();
        }
      }
    }
  else {
      for (let i = 0; i < this.m_polyNodes.ChildCount; i++) {
        const node = this.m_polyNodes.Childs[i];
        if (node.m_endtype === EndType.etClosedLine &&
          !Clipper.Orientation(node.m_polygon)) {
          node.m_polygon.reverse();
        }
      }
    }
  }

  private static GetUnitNormal(pt1: IntPoint, pt2: IntPoint): DoublePoint {
    let dx: double = pt2.X - pt1.X;
    let dy: double = pt2.Y - pt1.Y;
    if (dx === 0 && dy === 0) {
      return { dX: 0, dY: 0};
    }

    const f: double = 1.0 / Math.sqrt(dx * dx + dy * dy);
    dx *= f;
    dy *= f;

    return { dX: dy, dY: -dx };
  }

  private DoOffset(delta: double): void {
    this.m_destPolys = [];
    this.m_delta = delta;

    //if Zero offset, just copy any CLOSED polygons to m_p and return ...
    if (near_zero(delta)) {
      this.m_destPolys.length = this.m_polyNodes.ChildCount;
      let destPolysLength = 0;

      for (let i = 0; i < this.m_polyNodes.ChildCount; i++) {
        const node = this.m_polyNodes.Childs[i];
        if (node.m_endtype === EndType.etClosedPolygon) {
          this.m_destPolys[destPolysLength++] = node.m_polygon;
        }
      }
      this.m_destPolys.length = destPolysLength;
      return;
    }

    //see offset_triginometry3.svg in the documentation folder ...
    if (this.MiterLimit > 2) {
      this.m_miterLim = 2 / (this.MiterLimit * this.MiterLimit);
    }
    else {
      this.m_miterLim = 0.5;
    }

    let y: double = 0;
    if (this.ArcTolerance <= 0.0) {
      y = def_arc_tolerance;
    }
    else if (this.ArcTolerance > Math.abs(delta) * def_arc_tolerance) {
      y = Math.abs(delta) * def_arc_tolerance;
    }
    else {
      y = this.ArcTolerance;
    }
    //see offset_triginometry2.svg in the documentation folder ...
    const steps: double = Math.PI / Math.acos(1 - y / Math.abs(delta));
    this.m_sin = Math.sin(two_pi / steps);
    this.m_cos = Math.cos(two_pi / steps);
    this.m_StepsPerRad = steps / two_pi;
    if (delta < 0.0) {
      this.m_sin = -this.m_sin;
    }

    //this.m_destPolys.Capacity = this.m_polyNodes.ChildCount * 2;
    for (let i = 0; i < this.m_polyNodes.ChildCount; i++) {
      const node = this.m_polyNodes.Childs[i];
      this.m_srcPoly = node.m_polygon;

      const len = this.m_srcPoly.length;

      if (len === 0 || delta <= 0 && (len < 3 ||
        node.m_endtype !== EndType.etClosedPolygon)) {
        continue;
      }

      this.m_destPoly = [];

      if (len === 1) {
        if (node.m_jointype === JoinType.jtRound) {
          let X: double = 1.0, Y: double = 0.0;
          for (let j = 1; j <= steps; j++) {
            this.m_destPoly.push(newIntPoint(
              Round(this.m_srcPoly[0].X + X * delta),
              Round(this.m_srcPoly[0].Y + Y * delta)
            ));
            const X2 = X;
            X = X * this.m_cos - this.m_sin * Y;
            Y = X2 * this.m_sin + Y * this.m_cos;
          }
        }
        else {
          let X: double = -1.0, Y: double = -1.0;
          for (let j = 0; j < 4; ++j) {
            this.m_destPoly.push(newIntPoint(
              Round(this.m_srcPoly[0].X + X * delta),
              Round(this.m_srcPoly[0].Y + Y * delta)
            ));
            if (X < 0) {
              X = 1;
            }
            else if (Y < 0) {
              Y = 1;
            }
            else {
              X = -1;
            }
          }
        }
        this.m_destPolys.push(this.m_destPoly);
        continue;
      }

      //build m_normals ...
      this.m_normals.length = 0;
      //this.m_normals.Capacity = len;
      for (let j = 0; j < len - 1; j++) {
        this.m_normals.push(ClipperOffset.GetUnitNormal(this.m_srcPoly[j], this.m_srcPoly[j + 1]));
      }
      if (node.m_endtype === EndType.etClosedLine ||
        node.m_endtype === EndType.etClosedPolygon) {
        this.m_normals.push(ClipperOffset.GetUnitNormal(this.m_srcPoly[len - 1], this.m_srcPoly[0]));
      }
      else {
        // no need to clone since double points are never modified
        this.m_normals.push(this.m_normals[len - 2]);
      }

      if (node.m_endtype === EndType.etClosedPolygon) {
        let k = len - 1;
        for (let j = 0; j < len; j++) {
          k = this.OffsetPointNoRef(j, k, node.m_jointype);
        }
        this.m_destPolys.push(this.m_destPoly);
      }
      else if (node.m_endtype === EndType.etClosedLine) {
        let k = len - 1;
        for (let j = 0; j < len; j++) {
          k = this.OffsetPointNoRef(j, k, node.m_jointype);
        }
        this.m_destPolys.push(this.m_destPoly);
        this.m_destPoly = [];
        //re-build m_normals ...
        const n: DoublePoint = this.m_normals[len - 1];
        for (let j = len - 1; j > 0; j--) {
          this.m_normals[j] = { dX: -this.m_normals[j - 1].dX, dY: -this.m_normals[j - 1].dY };
        }
        this.m_normals[0] = { dX: -n.dX, dY: -n.dY };
        k = 0;
        for (let j = len - 1; j >= 0; j--) {
          k = this.OffsetPointNoRef(j, k, node.m_jointype);
        }
        this.m_destPolys.push(this.m_destPoly);
      }
      else {
        let k = 0;
        for (let j = 1; j < len - 1; ++j) {
          k = this.OffsetPointNoRef(j, k, node.m_jointype);
        }

        if (node.m_endtype === EndType.etOpenButt) {
          let pt1: IntPoint;
          const j = len - 1;
          pt1 = newIntPoint(Round(this.m_srcPoly[j].X + this.m_normals[j].dX * delta), Round(this.m_srcPoly[j].Y + this.m_normals[j].dY * delta));
          this.m_destPoly.push(pt1);
          pt1 = newIntPoint(Round(this.m_srcPoly[j].X - this.m_normals[j].dX * delta), Round(this.m_srcPoly[j].Y - this.m_normals[j].dY * delta));
          this.m_destPoly.push(pt1); // no need to clone
        }
        else {
          const j = len - 1;
          k = len - 2;
          this.m_sinA = 0;
          this.m_normals[j] = { dX: -this.m_normals[j].dX, dY: -this.m_normals[j].dY };
          if (node.m_endtype === EndType.etOpenSquare) {
            this.DoSquare(j, k);
          }
          else {
            this.DoRound(j, k);
          }
        }

        //re-build m_normals ...
        for (let j = len - 1; j > 0; j--) {
          this.m_normals[j] = { dX: -this.m_normals[j - 1].dX, dY: -this.m_normals[j - 1].dY };
        }

        this.m_normals[0] = { dX: -this.m_normals[1].dX, dY: -this.m_normals[1].dY };

        k = len - 1;
        for (let j = k - 1; j > 0; --j) {
          k = this.OffsetPointNoRef(j, k, node.m_jointype);
        }

        if (node.m_endtype === EndType.etOpenButt) {
          let pt1: IntPoint;
          pt1 = newIntPoint(Round(this.m_srcPoly[0].X - this.m_normals[0].dX * delta), Round(this.m_srcPoly[0].Y - this.m_normals[0].dY * delta));
          this.m_destPoly.push(pt1);
          pt1 = newIntPoint(Round(this.m_srcPoly[0].X + this.m_normals[0].dX * delta), Round(this.m_srcPoly[0].Y + this.m_normals[0].dY * delta));
          this.m_destPoly.push(pt1); // no need to clone
        }
        else {
          k = 1;
          this.m_sinA = 0;
          if (node.m_endtype === EndType.etOpenSquare) {
            this.DoSquare(0, 1);
          }
          else {
            this.DoRound(0, 1);
          }
        }
        this.m_destPolys.push(this.m_destPoly);
      }
    }
  }

  public ExecutePaths(delta: double): Paths {
    const solution: Paths = [];
    this.FixOrientations();
    this.DoOffset(delta);
    //now clean up 'corners' ...
    const clpr = new Clipper();
    clpr.AddPaths(this.m_destPolys!, PolyType.ptSubject, true);
    if (delta > 0) {
      clpr.ExecutePaths(ClipType.ctUnion, solution,
        PolyFillType.pftPositive, PolyFillType.pftPositive);
    }
    else {
      const r = ClipperBase.GetBounds(this.m_destPolys!);
      const outer = [
        newIntPoint(r.left - 10, r.bottom + 10),
        newIntPoint(r.right + 10, r.bottom + 10),
        newIntPoint(r.right + 10, r.top - 10),
        newIntPoint(r.left - 10, r.top - 10)
      ];

      clpr.AddPath(outer, PolyType.ptSubject, true);
      clpr.ReverseSolution = true;
      clpr.ExecutePaths(ClipType.ctUnion, solution, PolyFillType.pftNegative, PolyFillType.pftNegative);
      if (solution.length > 0) {
        solution.shift();
      }
    }
    return solution;
  }

  public ExecutePolyTree(delta: double): PolyTree {
    const solution = new PolyTree();
    this.FixOrientations();
    this.DoOffset(delta);

    //now clean up 'corners' ...
    const clpr = new Clipper();
    clpr.AddPaths(this.m_destPolys!, PolyType.ptSubject, true);
    if (delta > 0) {
      clpr.ExecutePolyTree(ClipType.ctUnion, solution,
        PolyFillType.pftPositive, PolyFillType.pftPositive);
    }
    else {
      const r = ClipperBase.GetBounds(this.m_destPolys!);
      const outer = [
        newIntPoint(r.left - 10, r.bottom + 10),
        newIntPoint(r.right + 10, r.bottom + 10),
        newIntPoint(r.right + 10, r.top - 10),
        newIntPoint(r.left - 10, r.top - 10)
      ];

      clpr.AddPath(outer, PolyType.ptSubject, true);
      clpr.ReverseSolution = true;
      clpr.ExecutePolyTree(ClipType.ctUnion, solution, PolyFillType.pftNegative, PolyFillType.pftNegative);
      //remove the outer PolyNode rectangle ...
      if (solution.ChildCount === 1 && solution.Childs[0].ChildCount > 0) {
        const outerNode = solution.Childs[0];
        //solution.Childs.Capacity = outerNode.ChildCount;
        solution.Childs[0] = outerNode.Childs[0];
        solution.Childs[0].m_Parent = solution;
        for (let i = 1; i < outerNode.ChildCount; i++) {
          solution.AddChild(outerNode.Childs[i]);
        }
      }
      else {
        solution.Clear();
      }
    }

    return solution;
  }

  private OffsetPointNoRef(j: int, /* ref */ k: int, jointype: JoinType): int { // ref k -> in k: k
    //cross product ...
    this.m_sinA = this.m_normals[k].dX * this.m_normals[j].dY - this.m_normals[j].dX * this.m_normals[k].dY;

    if (Math.abs(this.m_sinA * this.m_delta) < 1.0) {
      //dot product ...
      const cosA: double = this.m_normals[k].dX * this.m_normals[j].dX + this.m_normals[j].dY * this.m_normals[k].dY;
      if (cosA > 0) { // angle ==> 0 degrees
        this.m_destPoly!.push(newIntPoint(
          Round(this.m_srcPoly![j].X + this.m_normals[k].dX * this.m_delta),
          Round(this.m_srcPoly![j].Y + this.m_normals[k].dY * this.m_delta)
        ));
        return k;
      }
      //else angle ==> 180 degrees
    }
    else if (this.m_sinA > 1.0) {
      this.m_sinA = 1.0;
    }
    else if (this.m_sinA < -1.0) {
      this.m_sinA = -1.0;
    }

    if (this.m_sinA * this.m_delta < 0) {
      this.m_destPoly!.push(newIntPoint(
        Round(this.m_srcPoly![j].X + this.m_normals[k].dX * this.m_delta),
        Round(this.m_srcPoly![j].Y + this.m_normals[k].dY * this.m_delta)
      ));
      this.m_destPoly!.push(this.m_srcPoly![j]);
      this.m_destPoly!.push(newIntPoint(
        Round(this.m_srcPoly![j].X + this.m_normals[j].dX * this.m_delta),
        Round(this.m_srcPoly![j].Y + this.m_normals[j].dY * this.m_delta)
      ));
    }
    else {
      switch (jointype) {
        case JoinType.jtMiter:
          const r: double = 1 + (this.m_normals[j].dX * this.m_normals[k].dX + this.m_normals[j].dY * this.m_normals[k].dY);
          if (r >= this.m_miterLim) {
            this.DoMiter(j, k, r);
          }
          else {
            this.DoSquare(j, k);
          }
          break;
        case JoinType.jtSquare:
          this.DoSquare(j, k);
          break;
        case JoinType.jtRound:
          this.DoRound(j, k);
          break;
        default: break;
      }
    }
    k = j;
    return k;
  }

  private DoSquare(j: int, k: int): void {
    const dx: double = Math.tan(Math.atan2(this.m_sinA, this.m_normals[k].dX * this.m_normals[j].dX + this.m_normals[k].dY * this.m_normals[j].dY) / 4);
    this.m_destPoly!.push(newIntPoint(
      Round(this.m_srcPoly![j].X + this.m_delta * (this.m_normals[k].dX - this.m_normals[k].dY * dx)),
      Round(this.m_srcPoly![j].Y + this.m_delta * (this.m_normals[k].dY + this.m_normals[k].dX * dx))
    ));
    this.m_destPoly!.push(newIntPoint(
      Round(this.m_srcPoly![j].X + this.m_delta * (this.m_normals[j].dX + this.m_normals[j].dY * dx)),
      Round(this.m_srcPoly![j].Y + this.m_delta * (this.m_normals[j].dY - this.m_normals[j].dX * dx))
    ));
  }

  private DoMiter(j: int, k: int, r: double): void {
    const q: double = this.m_delta / r;
    this.m_destPoly!.push(newIntPoint(
      Round(this.m_srcPoly![j].X + (this.m_normals[k].dX + this.m_normals[j].dX) * q),
      Round(this.m_srcPoly![j].Y + (this.m_normals[k].dY + this.m_normals[j].dY) * q)
    ));
  }

  private DoRound(j: int, k: int): void {
    const a: double = Math.atan2(this.m_sinA, this.m_normals[k].dX * this.m_normals[j].dX + this.m_normals[k].dY * this.m_normals[j].dY);
    const steps: int = Math.max(Round(this.m_StepsPerRad * Math.abs(a)), 1);

    let X: double = this.m_normals[k].dX, Y: double = this.m_normals[k].dY, X2: double = 0;
    for (let i = 0; i < steps; ++i) {
      this.m_destPoly!.push(newIntPoint(
        Round(this.m_srcPoly![j].X + X * this.m_delta),
        Round(this.m_srcPoly![j].Y + Y * this.m_delta)
      ));
      X2 = X;
      X = X * this.m_cos - this.m_sin * Y;
      Y = X2 * this.m_sin + Y * this.m_cos;
    }
    this.m_destPoly!.push(newIntPoint(
      Round(this.m_srcPoly![j].X + this.m_normals[j].dX * this.m_delta),
      Round(this.m_srcPoly![j].Y + this.m_normals[j].dY * this.m_delta)
    ));
  }
}
