import Foundation
import AppKit
import PDFKit
import Vision
struct Extraction: Codable { let text:String; let engine:String; let pages:Int; let pageTexts:[String] }
func recognize(_ image:NSImage) throws -> String {
 let size=image.size
 guard size.width>0 && size.height>0 && size.width*size.height<100_000_000 else { throw NSError(domain:"Pulse",code:1,userInfo:[NSLocalizedDescriptionKey:"Image dimensions are too large."]) }
 var bounds=NSRect(origin:.zero,size:size)
 guard let cg=image.cgImage(forProposedRect:&bounds,context:nil,hints:nil) else { return "" }
 let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate;request.usesLanguageCorrection = false;request.recognitionLanguages=["en-US","fr-FR"]
 try VNImageRequestHandler(cgImage:cg,options:[:]).perform([request])
 let observations=(request.results ?? []).compactMap { result -> (String,CGRect)? in guard let candidate=result.topCandidates(1).first else {return nil};return (candidate.string,result.boundingBox) }
 // Rebuild visual rows so Current and YTD columns remain on the same line.
 var rows:[[(String,CGRect)]]=[]
 for observation in observations.sorted(by:{$0.1.midY>$1.1.midY}) {
  if let index=rows.firstIndex(where:{abs($0[0].1.midY-observation.1.midY)<max(0.006,min($0[0].1.height,observation.1.height)*0.45)}) {rows[index].append(observation)} else {rows.append([observation])}
 }
 return rows.map{$0.sorted(by:{$0.1.minX<$1.1.minX}).map{$0.0}.joined(separator:"  ")}.joined(separator:"\n")
}
do {
 let url=URL(fileURLWithPath:CommandLine.arguments[1]);let pdf=CommandLine.arguments[2]=="pdf"
 var texts:[String]=[],usedOCR=false
 if pdf {
  guard let doc=PDFDocument(url:url),!doc.isLocked else {throw NSError(domain:"Pulse",code:2,userInfo:[NSLocalizedDescriptionKey:"PDF cannot be read or is password protected."])}
  guard doc.pageCount>0 && doc.pageCount<=20 else {throw NSError(domain:"Pulse",code:3,userInfo:[NSLocalizedDescriptionKey:"Upload pay statements with at most 20 pages."])}
  for i in 0..<doc.pageCount {
   let page=doc.page(at:i)!,text=page.string ?? ""
   if text.trimmingCharacters(in:.whitespacesAndNewlines).count>=20 {texts.append(text)} else {
    let bounds=page.bounds(for:.mediaBox),scale=min(3.0,2500/max(bounds.width,bounds.height));usedOCR=true
    texts.append(try recognize(page.thumbnail(of:NSSize(width:bounds.width*scale,height:bounds.height*scale),for:.mediaBox)))
   }
  }
 } else {
  guard let image=NSImage(contentsOf:url) else {throw NSError(domain:"Pulse",code:4,userInfo:[NSLocalizedDescriptionKey:"Image could not be read."])}
  texts=[try recognize(image)];usedOCR=true
 }
 let result=Extraction(text:String(texts.joined(separator:"\n\n").prefix(200000)),engine:usedOCR ? "Apple Vision (local OCR)" : "PDFKit (local text)",pages:texts.count,pageTexts:texts)
 print(String(data:try JSONEncoder().encode(result),encoding:.utf8)!)
} catch {fputs(error.localizedDescription+"\n",stderr);exit(1)}
